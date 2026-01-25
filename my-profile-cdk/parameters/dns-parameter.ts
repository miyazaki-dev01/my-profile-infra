import * as cdk from "aws-cdk-lib";

export interface HostZoneProperty {
  zoneName?: string;
  hostedZoneId?: string;
}

export interface SearchConsoleProperty {
  recordValue: string;
}

export interface DnsStackProperty {
  env: cdk.Environment;
  props: {
    hostedZone: HostZoneProperty;
    searchConsole?: SearchConsoleProperty;
  };
}

export const dnsStackProperty: DnsStackProperty = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  props: {
    hostedZone: {
      zoneName: "profileofmiyazaki.com",
    },
    searchConsole: {
      recordValue:
        "google-site-verification=UzGcBPXs3NrJ96vKQQa-ojnEW7yxMz2bJNvwbcbFoNE",
    },
  },
};
