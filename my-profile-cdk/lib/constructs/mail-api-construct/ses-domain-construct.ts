import { Construct } from "constructs";
import * as r53 from "aws-cdk-lib/aws-route53";
import * as ses from "aws-cdk-lib/aws-ses";
import { SesParams } from "@/parameters/mail-parameter";
import { HostedZoneRef } from "@/lib/stacks/dns-stack";

export interface SesDomainConstructProps extends SesParams {
  hostedZoneRef: HostedZoneRef;
}

export class SesDomainConstruct extends Construct {
  public readonly domainName: string;

  constructor(scope: Construct, id: string, props: SesDomainConstructProps) {
    super(scope, id);

    // Route53: 同一ゾーンを参照
    const zone = r53.HostedZone.fromHostedZoneAttributes(this, "ImportedZone", {
      hostedZoneId: props.hostedZoneRef.hostedZoneId,
      zoneName: props.hostedZoneRef.zoneName,
    });

    // SES ドメインアイデンティティを作成（DKIM & MAIL FROM 自動設定）
    new ses.EmailIdentity(this, "SesDomainIdentity", {
      identity: ses.Identity.publicHostedZone(zone),
      mailFromDomain: `${props.mailFromSubdomain}.${zone.zoneName}`,
    });

    // ゾーン名を公開
    this.domainName = zone.zoneName;
  }
}
