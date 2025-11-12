import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { aws_route53 as r53 } from "aws-cdk-lib";
import { CertificateConstruct } from "@/lib/constructs/edge-cert-construct/certificate-construct";
import { EdgeCertStackProperty } from "@/parameters/edge-cert-parameter";
import { HostedZoneRef } from "@/lib/stacks/dns-stack";

export interface EdgeCertStackProps
  extends cdk.StackProps,
    Omit<EdgeCertStackProperty, "env"> {
  hostedZoneRef: HostedZoneRef;
}

export class EdgeCertStack extends cdk.Stack {
  public readonly certificateArn: string;

  constructor(scope: Construct, id: string, props: EdgeCertStackProps) {
    super(scope, id, props);

    // DnsStack が“所有”するゾーンを import（作らず参照のみ）
    const zone = r53.PublicHostedZone.fromHostedZoneAttributes(
      this,
      "ImportedZone",
      {
        hostedZoneId: props.hostedZoneRef.hostedZoneId,
        zoneName: props.hostedZoneRef.zoneName,
      }
    );

    // 証明書（既存参照 or 新規発行）
    const cert = new CertificateConstruct(this, "CertificatetConstruct", {
      certificateArn: props.props.certificateArn,
      certificateDomainName: props.props.certificateDomainName,
      hostedZone: zone,
    });

    // 作成した証明書のARNを公開
    this.certificateArn = cert.certificate.certificateArn;

    // --- 結果出力 ---
    new cdk.CfnOutput(this, "EdgeCertificateArn", {
      value: this.certificateArn,
    });
  }
}
