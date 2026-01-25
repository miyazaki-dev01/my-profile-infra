import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { DnsStackProperty } from "@/parameters/dns-parameter";
import { HostedZoneConstruct } from "@/lib/constructs/dns-construct/hosted-zone-construct";
import { SearchConsoleConstruct } from "@/lib/constructs/dns-construct/search-console-construct";

export interface HostedZoneRef {
  hostedZoneId: string;
  zoneName: string;
}

export interface DnsStackProps
  extends cdk.StackProps, Omit<DnsStackProperty, "env"> {}

export class DnsStack extends cdk.Stack {
  public readonly hostedZoneRef: HostedZoneRef;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    // Hosted Zone（公開ゾーン）を既存参照
    const hz = new HostedZoneConstruct(
      this,
      "HostedZoneConstruct",
      props.props.hostedZone,
    );

    // Search Console TXT（任意）
    const sc = props.props.searchConsole;
    if (sc?.recordValue) {
      new SearchConsoleConstruct(this, "SearchConsoleConstruct", {
        hostedZone: hz.hostedZone,
        recordValue: sc.recordValue,
      });
    }

    // 参照情報を公開
    this.hostedZoneRef = {
      hostedZoneId: hz.hostedZone.hostedZoneId,
      zoneName: hz.hostedZone.zoneName,
    };

    // --- 結果出力 ---
    new cdk.CfnOutput(this, "HostedZoneId", {
      value: this.hostedZoneRef.hostedZoneId,
    });

    new cdk.CfnOutput(this, "HostedZoneName", {
      value: this.hostedZoneRef.zoneName,
    });
  }
}
