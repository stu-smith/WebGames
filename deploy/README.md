# Deploying neongaming.net to AWS

Cheapest production-grade static hosting: **private S3 + CloudFront + free ACM cert + Route 53**.
Expected cost: ~**$0.50–$1.50/month** (mostly the Route 53 hosted-zone fee); traffic sits in
the CloudFront free tier for a low-traffic site.

## Prerequisites
- [AWS CLI](https://aws.amazon.com/cli/) installed and authenticated (`aws configure`).
- The domain `neongaming.net` (registered anywhere).

## First-time setup
```powershell
cd deploy
./deploy.ps1
```
The script will:
1. Create the Route 53 **hosted zone** and print four name servers.
2. **Pause** — set those name servers at your registrar, then let it verify delegation.
3. Deploy S3 + CloudFront + the TLS certificate (5–10 min; the cert can only validate
   *after* delegation is live).
4. Upload the site and invalidate the CloudFront cache.

## Everyday content updates
After editing games/HTML/CSS:
```powershell
cd deploy
./deploy.ps1 -ContentOnly
```
This re-syncs the files and invalidates the cache — no infrastructure changes.

## Why this shape
- **Everything is in `us-east-1`** because CloudFront only accepts ACM certificates from
  that region.
- **S3 stays private**; only CloudFront can read it (Origin Access Control + bucket policy).
- **HTTPS is mandatory** on a custom domain, which is why CloudFront (not the bare S3
  website endpoint) is used.
- A tiny **CloudFront Function** rewrites directory URLs like `/games/snake` to
  `/games/snake/index.html`.
- `PriceClass_100` keeps CloudFront to the cheapest edge locations (North America + Europe).

## Tearing it down
```powershell
aws s3 rm s3://neongaming.net --recursive
aws cloudformation delete-stack --stack-name neongaming-site --region us-east-1
aws cloudformation delete-stack --stack-name neongaming-dns  --region us-east-1
```
(Empty the bucket before deleting the site stack, or the delete will fail.)
