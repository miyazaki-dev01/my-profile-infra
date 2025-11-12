import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { aws_certificatemanager as acm, aws_route53 as r53 } from "aws-cdk-lib";
import { WebSiteStackProperty } from "@/parameters/website-parameter";
import { HostedZoneRef } from "@/lib/stacks/dns-stack";
import { BucketConstruct } from "@/lib/constructs/website-constructs/bucket-construct";
import { CdnConstruct } from "@/lib/constructs/website-constructs/cdn-construct";

export interface ApiOriginForContact {
  domainName: string;
  originPath: string;
}

export interface WebsiteStackProps
  extends cdk.StackProps,
    Omit<WebSiteStackProperty, "env"> {
  hostedZoneRef: HostedZoneRef;
  edgeCertificateArn: string;
  apiOriginForContact: ApiOriginForContact;
}

export class WebsiteStack extends cdk.Stack {
  public readonly originBucketName: string;
  public readonly distributionId: string;

  constructor(scope: Construct, id: string, props: WebsiteStackProps) {
    super(scope, id, props);

    // Route53: 同一ゾーンを参照
    const zone = r53.PublicHostedZone.fromHostedZoneAttributes(
      this,
      "ImportedZone",
      {
        hostedZoneId: props.hostedZoneRef.hostedZoneId,
        zoneName: props.hostedZoneRef.zoneName,
      }
    );

    // ACM: CloudFront用証明書（us-east-1発行のARNを参照）
    const edgeCert = acm.Certificate.fromCertificateArn(
      this,
      "EdgeCertRef",
      props.edgeCertificateArn
    );

    // S3: 配信用バケット
    const contentBucket = new BucketConstruct(this, "BucketConstruct", {
      bucketName: props.props.bucket?.bucketName,
    }).bucket;

    // CloudFront: CDN構築
    const cdn = new CdnConstruct(this, "CdnConstruct", {
      contentBucket,
      certificate: edgeCert,
      hostedZone: zone,
      apiOriginForContact: props.apiOriginForContact,
      ...props.props.contentsDelivery,
    });

    // 各種情報を公開
    this.originBucketName = contentBucket.bucketName;
    this.distributionId = cdn.distribution.distributionId;

    // --- 結果出力 ---
    new cdk.CfnOutput(this, "SiteDomain", {
      value: props.props.contentsDelivery.domainName,
      exportName: `${cdk.Stack.of(this).stackName}-SiteDomain`,
    });

    new cdk.CfnOutput(this, "DistributionId", {
      value: cdn.distribution.distributionId,
      exportName: `${cdk.Stack.of(this).stackName}-DistributionId`,
    });

    new cdk.CfnOutput(this, "DistributionDomainName", {
      value: cdn.distribution.domainName,
      exportName: `${cdk.Stack.of(this).stackName}-DistributionDomainName`,
    });

    new cdk.CfnOutput(this, "ContentBucketName", {
      value: contentBucket.bucketName,
      exportName: `${cdk.Stack.of(this).stackName}-ContentBucketName`,
    });
  }
}
