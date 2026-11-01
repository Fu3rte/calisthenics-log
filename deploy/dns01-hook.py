import json
import os
import subprocess
import shutil
import sys
import time

# certbot --manual 的 DNS-01 钩子：用腾讯云官方 SDK 在 DNSPod 建/删 _acme-challenge TXT 记录。
# 凭证读 /etc/letsencrypt/dnspod-credentials.json：{"SecretId": "...", "SecretKey": "..."}
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.common.profile.client_profile import ClientProfile
from tencentcloud.dnspod.v20210323 import dnspod_client, models

CRED_PATH = os.environ.get("DNSPOD_CRED", "/etc/letsencrypt/dnspod-credentials.json")
PROPAGATE_TIMEOUT = 120


def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def dig(*args):
    return subprocess.run(
        ["dig", "+short", "+tries=2", "+timeout=3", *args],
        capture_output=True,
        text=True,
        check=False,
    ).stdout


def zone_of(client, fqdn):
    """在账号下的域名列表里挑出能匹配 fqdn 后缀的最长主域名，并带回该域名的默认 TTL。"""
    req = models.DescribeDomainListRequest()
    req.Offset = 0
    req.Limit = 3000
    resp = client.DescribeDomainList(req)
    best = None
    for dom in resp.DomainList or []:
        name = dom.Name
        if (fqdn == name or fqdn.endswith("." + name)) and (best is None or len(name) > len(best.Name)):
            best = dom
    if best is None:
        die(f"该账号的 DNSPod 域名列表里没有 {fqdn}")
    return best.Name, fqdn[: -(len(best.Name) + 1)], best.TTL


def txt_records(client, zone, sub):
    req = models.DescribeRecordListRequest()
    req.Domain = zone
    req.SubDomain = sub
    req.RecordType = "TXT"
    req.ErrorOnEmpty = "0"
    req.Offset = 0
    req.Limit = 100
    return [(r.RecordId, r.Value) for r in client.DescribeRecordList(req).RecordList or []]


def wait_until_visible(zone, sub, value):
    """DNSPod 写入到权威 NS 生效有延迟，逐台问权威确认可见再放行。"""
    if shutil.which("dig") is None:
        die("缺少 dig，请先安装 dnsutils")
    servers = [s for s in dig("NS", zone).split() if s.endswith(".")]
    if not servers:
        die(f"查不到 {zone} 的权威 NS")
    name = f"{sub}.{zone}"
    deadline = time.time() + PROPAGATE_TIMEOUT
    while True:
        for ns in servers:
            answers = dig("TXT", name, f"@{ns}")
            if any(value in line.strip('"') for line in answers.splitlines()):
                print(f"{value[:8]}… 已在权威 {ns} 生效")
                return
        if time.time() > deadline:
            die(f"TXT {name} 在 {PROPAGATE_TIMEOUT} 秒内未出现在权威 NS {servers}")
        time.sleep(3)


def delete_all_txt(client, zone, sub):
    for rid, _ in txt_records(client, zone, sub):
        req = models.DeleteRecordRequest()
        req.Domain = zone
        req.RecordId = rid
        client.DeleteRecord(req)
        print(f"已删除 TXT {sub}.{zone} (RecordId={rid})")


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("auth", "cleanup"):
        die("用法：dns01-hook.py auth|cleanup")
    try:
        with open(CRED_PATH, encoding="utf-8") as f:
            cred = json.load(f)
        client = dnspod_client.DnspodClient(
            credential.Credential(cred["SecretId"], cred["SecretKey"]),
            "",
            ClientProfile(),
        )
    except (OSError, KeyError, json.JSONDecodeError) as e:
        die(f"读取凭证失败（{CRED_PATH}）：{e}")

    domain = os.environ["CERTBOT_DOMAIN"]
    value = os.environ["CERTBOT_VALIDATION"]
    zone, sub, ttl = zone_of(client, f"_acme-challenge.{domain}")

    if sys.argv[1] == "auth":
        delete_all_txt(client, zone, sub)
        req = models.CreateRecordRequest()
        req.Domain = zone
        req.SubDomain = sub
        req.RecordType = "TXT"
        req.Value = value
        req.TTL = ttl
        req.RecordLine = "默认"
        client.CreateRecord(req)
        wait_until_visible(zone, sub, value)
        print(f"已创建 TXT {sub}.{zone} (TTL={ttl})")
    else:
        delete_all_txt(client, zone, sub)


try:
    main()
except TencentCloudSDKException as e:
    die(f"DNSPod 接口失败：{e}")
