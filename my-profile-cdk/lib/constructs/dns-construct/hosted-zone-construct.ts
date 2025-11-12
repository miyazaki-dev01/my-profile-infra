import { Construct } from "constructs";
import { aws_route53 as r53 } from "aws-cdk-lib";
import { HostZoneProperty } from "@/parameters/dns-parameter";

export interface HostedZoneConstructProps extends HostZoneProperty {}

/**
 * Route 53 の「公開 Hosted Zone」を 新規作成せずに参照(import)する ためのコンストラクト
 *
 * - `hostedZoneId` があれば **ID指定で参照**（一意で安定：推奨）
 * - `zoneName` があれば **fromLookup で参照**（ドメイン名で検索）
 * - どちらも未指定、または両方指定はエラー（設定ミスを早期検知）
 *
 * 補足:
 * - fromLookup は `cdk synth` 時にアカウントへ問い合わせ、`cdk.context.json` に結果がキャッシュされる。
 *   ゾーンを作り直した等で参照先が変わったら `cdk context --clear` を実行する。
 * - Route53 でドメインを「登録」した場合、公開ホストゾーンは自動作成されるため、
 *   本コンストラクトでは 新規作成(New PublicHostedZone) は行わない。
 */
export class HostedZoneConstruct extends Construct {
  readonly hostedZone: r53.IPublicHostedZone;

  constructor(scope: Construct, id: string, props: HostedZoneConstructProps) {
    super(scope, id);

    // 相互排他チェック
    if (props.zoneName && props.hostedZoneId) {
      throw new Error("Provide either zoneName or hostedZoneId, not both.");
    }
    if (!props.hostedZoneId && !props.zoneName) {
      throw new Error("hostedZoneId or zoneName is required.");
    }

    // 優先: hostedZoneId（安定で一意）
    if (props.hostedZoneId) {
      this.hostedZone = r53.PublicHostedZone.fromHostedZoneId(
        this,
        "HostedZone",
        props.hostedZoneId
      );
      return;
    }

    // 代替: zoneName（lookupで既存ゾーンを検索）
    this.hostedZone = r53.PublicHostedZone.fromLookup(this, "HostedZone", {
      domainName: props.zoneName!,
    });
  }
}
