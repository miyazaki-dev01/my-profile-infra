import { Construct } from "constructs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { Stack } from "aws-cdk-lib";
import { ApiGatewayParams } from "@/parameters/mail-parameter";

export interface ContactApiConstructProps extends ApiGatewayParams {
  handler: lambda.IFunction;
}

export interface ContactApiConstructOutputs {
  restApi: apigw.RestApi;
  apiDomainForCf: string;
  stageName: string;
}

export class ContactApiConstruct extends Construct {
  public readonly outputs: ContactApiConstructOutputs;

  constructor(scope: Construct, id: string, props: ContactApiConstructProps) {
    super(scope, id);

    const stageName = props.stageName ?? "prod";

    // アクセスログ用 LogGroup
    const accessLogs = new logs.LogGroup(this, "ApiAccessLogs", {
      retention: logs.RetentionDays.ONE_MONTH, // ログ保持期間は既定で 1ヶ月
    });

    // REST API（Regional）
    const api = new apigw.RestApi(this, "MailApi", {
      restApiName: "MailApi",
      description: "Contact form API (API Gateway → Lambda → SES)",
      endpointConfiguration: { types: [apigw.EndpointType.REGIONAL] },      // エンドポイント種別：Regional（CF から接続）
      deployOptions: {
        stageName,                                                          // ステージ名（"prod"）
        accessLogDestination: new apigw.LogGroupLogDestination(accessLogs), // アクセスログの出力先
        accessLogFormat: apigw.AccessLogFormat.jsonWithStandardFields({
          caller: true,                                                     // 呼び出し元（認証情報など）
          httpMethod: true,                                                 // HTTP メソッド（POST 等）
          ip: true,                                                         // クライアント IP
          protocol: true,                                                   // プロトコル（HTTP/1.1 等）
          requestTime: true,                                                // リクエスト時刻
          resourcePath: true,                                               // リソースパス（/contact）
          responseLength: true,                                             // レスポンスサイズ
          status: true,                                                     // ステータスコード
          user: true,                                                       // ユーザー識別（あれば）
        }),
        loggingLevel: apigw.MethodLoggingLevel.INFO,                        // メソッドログの詳細度（INFO：適度）
        metricsEnabled: true,                                               // CloudWatch メトリクス有効化（可観測性）
        dataTraceEnabled: false,                                            // リクエスト/レスポンス本文の生記録は無効（個人情報保護）
        throttlingBurstLimit: props.throttle.burst,                         // バースト制限（瞬間的な同時呼び出し数の上限）
        throttlingRateLimit: props.throttle.rate,                           // 1秒あたりの平均レート上限
      },
      ...(props.allowedOrigins && props.allowedOrigins.length > 0           // CORS を設定したいときだけオプションを付与
        ? {
            defaultCorsPreflightOptions: {                                  // 自動で OPTIONS 応答（プリフライト）を有効化
              allowOrigins: props.allowedOrigins,                           // 許可するオリジン
              allowMethods: ["POST", "OPTIONS"],                            // 使うメソッドだけ許可
              allowHeaders: ["Content-Type", "X-Requested-With"],           // 必要なヘッダだけ許可
            },
          }
        : {}),                                                              // CloudFront リバースプロキシのみで同一オリジンなら CORS 省略可
    });

    // (A) API Gateway → CloudWatch Logs 出力用の IAM ロール
    //     - 信頼ポリシー: apigateway.amazonaws.com
    //     - 付与権限   : AmazonAPIGatewayPushToCloudWatchLogs（AWS管理ポリシー）
    const apiGwCloudWatchRole =
      (this.node.tryFindChild("ApiGwCloudWatchRole") as iam.Role) ??
      new iam.Role(this, "ApiGwCloudWatchRole", {
        assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AmazonAPIGatewayPushToCloudWatchLogs"
          ),
        ],
      });

    // (B) アカウント設定（Region 単位で一意）にロール ARN を登録
    const apiGwAccount =
      (this.node.tryFindChild("ApiGwAccount") as apigw.CfnAccount) ??
      new apigw.CfnAccount(this, "ApiGwAccount", {
        cloudWatchRoleArn: apiGwCloudWatchRole.roleArn,
      });

    // (C) この設定が効いてから Stage を作るよう、Stage → Account に依存関係を張る
    const cfnStage = api.deploymentStage.node.defaultChild as apigw.CfnStage;
    cfnStage.addDependency(apiGwAccount);

    // 入力 JSON の簡易スキーマ（形式はLambda側で厳格確認）
    const requestModel = new apigw.Model(this, "ContactRequestModel", {
      restApi: api,
      contentType: "application/json",
      modelName: "ContactRequest",
      schema: {
        schema: apigw.JsonSchemaVersion.DRAFT4,                                          // スキーマバージョン
        title: "ContactRequest",                                                         // スキーマタイトル
        type: apigw.JsonSchemaType.OBJECT,                                               // オブジェクト形式の期待
        required: ["name", "email", "title", "message"],                                 // 必須4項目（フォーム仕様）
        properties: {
          name:    { type: apigw.JsonSchemaType.STRING, minLength: 1, maxLength: 100 },  // 名前：1〜100文字
          email:   { type: apigw.JsonSchemaType.STRING, minLength: 3, maxLength: 100 },  // メール：3〜100文字
          title:   { type: apigw.JsonSchemaType.STRING, minLength: 1, maxLength: 300 },  // タイトル：1〜300文字
          message: { type: apigw.JsonSchemaType.STRING, minLength: 1, maxLength: 5000 }, // 本文：1〜5000文字
        },
      },
    });

    // リクエストボディ検証器
    const bodyValidator = new apigw.RequestValidator(this, "BodyValidator", {
      restApi: api,
      validateRequestBody: true,                 // ボディのスキーマ検証をオン
      validateRequestParameters: false,          // クエリ/パスの検証は不要
      requestValidatorName: "BodyOnlyValidator",
    });

    // /contact（POST） → Lambda プロキシ統合
    const apiRoot = api.root.addResource("api");    // ルート直下に /api リソースを作成
    const contact = apiRoot.addResource("contact"); // /api/contact リソースを作成
    contact.addMethod(
      "POST",
      new apigw.LambdaIntegration(props.handler, { proxy: true }), // Lambda プロキシ統合（イベントそのまま渡す）
      {
        requestModels: { "application/json": requestModel },       // 上で定義したスキーマを適用
        requestValidator: bodyValidator,                           // 入力バリデーションを有効化
        apiKeyRequired: false,                                     // API キー不要（必要になれば後から有効化も可）
      }
    );

    // CloudFront のオリジンに使うドメイン名を生成
    const apiDomainForCf = `${api.restApiId}.execute-api.${Stack.of(this).region}.amazonaws.com`;

    this.outputs = { restApi: api, apiDomainForCf, stageName };
  }
}
