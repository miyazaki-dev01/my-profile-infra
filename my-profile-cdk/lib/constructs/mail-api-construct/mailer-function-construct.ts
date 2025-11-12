import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import { LambdaParams } from "@/parameters/mail-parameter";

export interface MailerFunctionConstructProps extends LambdaParams {
  domainName: string;
}

export interface MailerFunctionConstructOutputs {
  fn: lambdaNode.NodejsFunction;
}

export class MailerFunctionConstruct extends Construct {
  public readonly function: MailerFunctionConstructOutputs;

  constructor(
    scope: Construct,
    id: string,
    props: MailerFunctionConstructProps
  ) {
    super(scope, id);

    // 差出人メールアドレス
    const fromAddress = `${props.fromLocalPart}@${props.domainName}`;

    // 事前にロググループを作成
    const sendMailFnLogs = new logs.LogGroup(this, "SendMailFnLogs", {
      retention: logs.RetentionDays.ONE_MONTH, // ログ保持1ヶ月
      removalPolicy: RemovalPolicy.DESTROY,    // Destroy 方針
    });

    // 送信用のLambda関数を作成
    const fn = new lambdaNode.NodejsFunction(this, "SendMailFn", {
      entry: require.resolve("@/functions/lambda/send-mail.ts"), // Lambdaエントリ
      runtime: lambda.Runtime.NODEJS_20_X,                       // Node.js 20
      memorySize: 256,                                           // メモリ（256MB）
      timeout: Duration.seconds(10),                             // タイムアウト（10秒）
      bundling: { target: "node20" },                            // esbuildターゲット
      logGroup: sendMailFnLogs,
      environment: {
        FROM_EMAIL: fromAddress,                                 // 差出人
        TO_EMAIL  : props.fixedToGmail,                          // 宛先
        ALLOWED_ORIGINS: props.allowedOrigins.join(","),         // 許可するオリジン（カンマ区切り）
      }
    });

    // SES送信の最小権限（Fromを固定するConditionで縛る）
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail"],         // 送信に必要な権限
        resources: ["*"],                   // SESの仕様上"*"で可
        conditions: {
          StringEquals: {
            "ses:FromAddress": fromAddress, // 差出人を固定
          },
        },  
      })
    );

    this.function = { fn };
  }
}
