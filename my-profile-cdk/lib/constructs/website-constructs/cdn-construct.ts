import { Construct } from "constructs";
import {
  aws_cloudfront as cf,
  aws_cloudfront_origins as origins,
  aws_route53 as r53,
  aws_route53_targets as targets,
  aws_s3 as s3,
  Duration,
} from "aws-cdk-lib";
import { ContentsDeliveryProperty } from "@/parameters/website-parameter";
import type { ApiOriginForContact } from "@/lib/stacks/website-stack";

export interface CdnConstructProps extends ContentsDeliveryProperty {
  contentBucket: s3.IBucket;
  certificate: import("aws-cdk-lib/aws-certificatemanager").ICertificate;
  hostedZone: r53.IPublicHostedZone;
  apiOriginForContact: ApiOriginForContact;
}

export class CdnConstruct extends Construct {
  readonly distribution: cf.Distribution;

  constructor(scope: Construct, id: string, props: CdnConstructProps) {
    super(scope, id);

    // レスポンスヘッダポリシー（セキュリティ系）
    const headers = new cf.ResponseHeadersPolicy(this, "SecurityHeaders", {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },                 // X-Content-Type-Options: nosniff
        frameOptions: {                                         // X-Frame-Options: DENY
          frameOption: cf.HeadersFrameOption.DENY,
          override: true,
        },
        referrerPolicy: {                                       // Referrer-Policy
          referrerPolicy: cf.HeadersReferrerPolicy.NO_REFERRER,
          override: true,
        },
        strictTransportSecurity: {                              // HSTS（HTTPS常用）
          accessControlMaxAge: Duration.days(365),              // max-age=31536000
          includeSubdomains: true,                              // includeSubDomains
          preload: true,                                        // preload（Chromium HSTSプリロード）
          override: true,                                       // オリジン応答より優先
        },
      },
    });

    // キャッシュポリシー（静的サイト向け）
    const defaultCache = new cf.CachePolicy(this, "DefaultCache", {
      cachePolicyName: "default-html-aware",                   // 一意な名前
      defaultTtl: Duration.hours(1),                           // HTML等の既定TTL
      minTtl: Duration.seconds(0),                             // 即時上書きも許容
      maxTtl: Duration.days(7),                                // 最長でも7日
      enableAcceptEncodingBrotli: true,                        // Brotli対応
      enableAcceptEncodingGzip: true,                          // gzip対応
      cookieBehavior: cf.CacheCookieBehavior.none(),           // クッキーをキーに含めない
      headerBehavior: cf.CacheHeaderBehavior.none(),           // ヘッダをキーに含めない
      queryStringBehavior: cf.CacheQueryStringBehavior.none(), // クエリをキーに含めない
    });

    // ディレクトリインデックス補完用の CloudFront Function
    let rewriteFn: cf.Function | undefined = undefined;
    if (props.enableDirectoryIndex === "cf2") {
      const filePath = require.resolve("@/functions/cf2/directory-index.js");
      rewriteFn = new cf.Function(this, "DirectoryIndexFn", {
        code: cf.FunctionCode.fromFile({ filePath }),
      });
    }

    // API Gateway へのオリジン（Contact用）
    const apiOrigin = new origins.HttpOrigin(
      props.apiOriginForContact.domainName,
      {
        originPath: props.apiOriginForContact.originPath,
        protocolPolicy: cf.OriginProtocolPolicy.HTTPS_ONLY, // API GW は HTTPS
      }
    );

    // API の Preflight に必要なヘッダだけを転送するポリシー
    const apiCorsOriginRequestPolicy = new cf.OriginRequestPolicy(
      this,
      "ApiCorsReqPolicy",
      {
        comment: "Forward CORS preflight headers to API",
        headerBehavior: cf.OriginRequestHeaderBehavior.allowList(
          "Origin",
          "Access-Control-Request-Method",
          "Access-Control-Request-Headers"
        ),
        queryStringBehavior: cf.OriginRequestQueryStringBehavior.all(),
        cookieBehavior: cf.OriginRequestCookieBehavior.none(),
      }
    );

    // CloudFront Distribution
    this.distribution = new cf.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(            // OACでS3を私的アクセス
          props.contentBucket
        ),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,   // HTTP→HTTPS
        responseHeadersPolicy: headers,                                    // セキュリティヘッダ
        functionAssociations: rewriteFn                                    // ディレクトリ補完
          ? [
              {
                eventType: cf.FunctionEventType.VIEWER_REQUEST,
                function: rewriteFn,
              },
            ]
          : undefined,
        compress: true,                                                    // 自動圧縮
        cachePolicy: defaultCache,                                         // 上記キャッシュ方針
        allowedMethods: cf.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,          // 読み取り系のみ許可
      },
      additionalBehaviors: {
        "api/*": {
          origin: apiOrigin,
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS, // HTTPS 強制
          allowedMethods: cf.AllowedMethods.ALLOW_ALL,                     // POST/OPTIONS 含む
          cachePolicy: cf.CachePolicy.CACHING_DISABLED,                    // フォームはキャッシュしない
          originRequestPolicy: apiCorsOriginRequestPolicy,                 // ヘッダ/クッキー/クエリを転送（安全策）
          responseHeadersPolicy: headers,                                  // 同じセキュリティヘッダ
          compress: false,                                                 // API は圧縮不要
        },
      },
      defaultRootObject: "index.html",                                     // ルート(/)はindex.html
      certificate: props.certificate,                                      // TLS終端
      domainNames: [props.domainName],                                     // ALTN(CNAME)
      errorResponses: [                                                    // 403/404は404.htmlへ
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: "/404.html",
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: "/404.html",
          ttl: Duration.minutes(5),
        },
      ],
      priceClass: cf.PriceClass.PRICE_CLASS_200,                           // コスト/性能バランス
      minimumProtocolVersion: cf.SecurityPolicyProtocol.TLS_V1_2_2021,     // TLS最低バージョン
      httpVersion: cf.HttpVersion.HTTP3,                                   // HTTP/3対応
    });

    // Route53の recordName はゾーン相対にする（安全策）
    const zoneName = props.hostedZone.zoneName;
    const isApex = props.domainName === zoneName;
    const relativeRecordName = isApex
      ? undefined
      : props.domainName.replace(`.${zoneName}`, "");

    // --- Route53: A / AAAA のALIAS（CloudFront） ---
    new r53.ARecord(this, "AliasA", {
      zone: props.hostedZone,
      recordName: relativeRecordName,
      target: r53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution)
      ),
    });

    new r53.AaaaRecord(this, "AliasAAAA", {
      zone: props.hostedZone,
      recordName: relativeRecordName,
      target: r53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution)
      ),
    });
  }
}
