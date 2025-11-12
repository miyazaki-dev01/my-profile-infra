import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import { DnsStack } from "@/lib/stacks/dns-stack";
import { EdgeCertStack } from "@/lib/stacks/edge-cert-stack";
import { WebsiteStack } from "@/lib/stacks/website-stack";
import { MailApiStack } from "@/lib/stacks/mail-api-stack";
import { CicdOidcRoleStack } from "@/lib/stacks/cicd-oidc-role-stack";

import { dnsStackProperty } from "@/parameters/dns-parameter";
import { edgeCertStackProperty } from "@/parameters/edge-cert-parameter";
import { websiteStackProperty } from "@/parameters/website-parameter";
import { mailApiStackProperty } from "@/parameters/mail-parameter";
import { cicdOidcRoleStackProperty } from "@/parameters/oidc-parameter";

export class MyProfileCdkStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    // DNS（Hosted Zone）の参照
    const dns = new DnsStack(this, "DnsStack", {
      ...dnsStackProperty,
    });

    // EdgeCert（us-east-1 で証明書発行 or 既存参照）
    const edgeCert = new EdgeCertStack(this, "EdgeCertStack", {
      ...edgeCertStackProperty,
      hostedZoneRef: dns.hostedZoneRef,
    });

    // Mail API（API Gateway + Lambda + SES）
    const mailApi = new MailApiStack(this, "MailApiStack", {
      ...mailApiStackProperty,
      hostedZoneRef: dns.hostedZoneRef,
    });

    // Website（S3 + CloudFront + Route53）
    const website = new WebsiteStack(this, "WebsiteStack", {
      ...websiteStackProperty,
      hostedZoneRef: dns.hostedZoneRef,
      edgeCertificateArn: edgeCert.certificateArn,
      apiOriginForContact: {
        domainName: mailApi.apiDomainForCf,
        originPath: `/${mailApi.apiStageName}`,
      },
      crossRegionReferences: true, // CloudFront は us-east-1 で作成されるため、クロスリージョン参照を許可
    });

    // CICD OIDC Role（GitHub Actions 用 IAM Role）
    new CicdOidcRoleStack(this, "CicdOidcRoleStack", {
      ...cicdOidcRoleStackProperty,
      bucketName: website.originBucketName,
      distributionId: website.distributionId,
    });
  }
}
