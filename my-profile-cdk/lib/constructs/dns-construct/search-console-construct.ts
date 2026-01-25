import { Construct } from "constructs";
import { Duration, aws_route53 as r53 } from "aws-cdk-lib";
import type { SearchConsoleProperty } from "@/parameters/dns-parameter";

export interface SearchConsoleConstructProps extends SearchConsoleProperty {
  hostedZone: r53.IHostedZone;
}

export class SearchConsoleConstruct extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: SearchConsoleConstructProps,
  ) {
    super(scope, id);

    new r53.TxtRecord(this, "SearchConsoleVerification", {
      zone: props.hostedZone,
      values: [props.recordValue],
      ttl: Duration.minutes(5),
    });
  }
}
