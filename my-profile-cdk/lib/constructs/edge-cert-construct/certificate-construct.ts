import { Construct } from "constructs";
import { EdgeCertProperty } from "@/parameters/edge-cert-parameter";
import { aws_certificatemanager as acm, aws_route53 as r53 } from "aws-cdk-lib";

export interface CertificateConstructProps extends EdgeCertProperty {
  hostedZone?: r53.IHostedZone;
}

/**
 * ACM証明書を「新規作成」または「既存参照」するためのコンストラクト
 * - domainName があれば新規作成
 * - certificateArn があれば既存参照
 * - どちらも無い／両方ある場合はエラー（相互排他チェック）
 */
export class CertificateConstruct extends Construct {
  readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: CertificateConstructProps) {
    super(scope, id);

    // 既存ARNがある：それを参照
    if (props.certificateArn) {
      this.certificate = acm.Certificate.fromCertificateArn(
        this,
        "ExistingCert",
        props.certificateArn
      );
      return;
    }

    // 新規発行なら domain と hostedZone が必須
    if (!props.certificateDomainName || !props.hostedZone) {
      throw new Error(
        "certificateDomainName and hostedZone are required to create a new certificate."
      );
    }

    // DNS検証：Route53 に検証用CNAMEを自動作成
    this.certificate = new acm.Certificate(this, "Certificate", {
      domainName: props.certificateDomainName,
      validation: acm.CertificateValidation.fromDns(props.hostedZone),
    });
  }
}
