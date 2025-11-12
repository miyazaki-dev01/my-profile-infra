import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { MailApiStackProperty } from "@/parameters/mail-parameter";
import { HostedZoneRef } from "@/lib/stacks/dns-stack";
import { SesDomainConstruct } from "@/lib/constructs/mail-api-construct/ses-domain-construct";
import { MailerFunctionConstruct } from "@/lib/constructs/mail-api-construct/mailer-function-construct";
import { ContactApiConstruct } from "@/lib/constructs/mail-api-construct/contact-api-construct";

export interface MailApiStackProps
  extends cdk.StackProps,
    Omit<MailApiStackProperty, "env"> {
  hostedZoneRef: HostedZoneRef;
}

export class MailApiStack extends cdk.Stack {
  public readonly apiDomainForCf: string;
  public readonly apiStageName: string;

  constructor(scope: Construct, id: string, props: MailApiStackProps) {
    super(scope, id, props);

    // SES（ドメイン検証＋MAIL FROM）
    const ses = new SesDomainConstruct(this, "SesDomainConstruct", {
      ...props.props.ses,
      hostedZoneRef: props.hostedZoneRef,
    });

    // Lambda（送信ロジック）
    const mailer = new MailerFunctionConstruct(
      this,
      "MailerFunctionConstruct",
      {
        ...props.props.lambda,
        domainName: ses.domainName,
      }
    );

    // API Gateway
    const apiGw = new ContactApiConstruct(this, "ContactApiConstruct", {
      ...props.props.apiGateway,
      handler: mailer.function.fn,
    });

    // CloudFront用の execute-api ドメインを保持
    this.apiDomainForCf = apiGw.outputs.apiDomainForCf;
    this.apiStageName = apiGw.outputs.stageName;

    // --- 結果の出力 ---
    new cdk.CfnOutput(this, "ApiInvokeUrl", {
      value: apiGw.outputs.restApi.url ?? "undefined",
    });
    new cdk.CfnOutput(this, "ApiDomainForCloudFront", {
      value: this.apiDomainForCf,
    });
  }
}
