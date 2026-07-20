<#
.SYNOPSIS
    Deploys and/or updates the neongaming.net static site on AWS
    (S3 + CloudFront + ACM + Route 53).

.DESCRIPTION
    Full run (default): deploys the DNS stack, waits for you to delegate the
    domain at your registrar, deploys the site stack, then uploads the site.

    -ContentOnly: skips all infrastructure and just re-uploads the files and
    invalidates the CloudFront cache. Use this for everyday content updates.

.EXAMPLE
    ./deploy.ps1                 # first-time setup + content upload
    ./deploy.ps1 -ContentOnly    # push new content after editing the games

.NOTES
    Requires the AWS CLI, configured with credentials (`aws configure`).
    Everything is created in us-east-1 (required for CloudFront ACM certs).
#>

[CmdletBinding()]
param(
    [string] $DomainName   = 'neongaming.net',
    [string] $Region       = 'us-east-1',
    [string] $DnsStack     = 'neongaming-dns',
    [string] $SiteStack    = 'neongaming-site',
    [switch] $ContentOnly
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent $scriptDir   # site files live one level up

function Get-Output($stack, $key) {
    aws cloudformation describe-stacks --stack-name $stack --region $Region `
        --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" --output text
}

# --- Sanity check: is the AWS CLI available and authenticated? ---
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI not found. Install it from https://aws.amazon.com/cli/ and run 'aws configure'."
}
aws sts get-caller-identity --output text | Out-Null

if (-not $ContentOnly) {

    # ============================================================
    # 1. DNS stack (hosted zone)
    # ============================================================
    Write-Host "`n=== [1/4] Deploying DNS stack ($DnsStack) ===" -ForegroundColor Cyan
    aws cloudformation deploy `
        --template-file (Join-Path $scriptDir 'dns.yaml') `
        --stack-name $DnsStack `
        --region $Region `
        --parameter-overrides DomainName=$DomainName

    $hostedZoneId = Get-Output $DnsStack 'HostedZoneId'
    $nameServers  = Get-Output $DnsStack 'NameServers'

    Write-Host "`nHosted zone: $hostedZoneId" -ForegroundColor Green
    Write-Host "Set these name servers at your domain registrar for $DomainName :" -ForegroundColor Yellow
    ($nameServers -split '\s*\|\s*') | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }

    # ============================================================
    # 2. Wait for the registrar delegation to go live
    # ============================================================
    Write-Host "`n=== [2/4] Waiting for name server delegation ===" -ForegroundColor Cyan
    Write-Host "The site stack cannot issue its TLS certificate until public DNS"
    Write-Host "for $DomainName points at the Route 53 name servers above."
    Read-Host "Update the registrar now, then press Enter to check delegation" | Out-Null

    $expected = ($nameServers -split '\s*\|\s*' | ForEach-Object { $_.TrimEnd('.').ToLower() })
    while ($true) {
        try {
            $live = (Resolve-DnsName -Name $DomainName -Type NS -DnsOnly -ErrorAction Stop |
                     Where-Object { $_.QueryType -eq 'NS' }).NameHost |
                     ForEach-Object { $_.TrimEnd('.').ToLower() }
        } catch { $live = @() }

        $matched = $expected | Where-Object { $live -contains $_ }
        if ($matched.Count -ge 1) {
            Write-Host "Delegation detected. Continuing." -ForegroundColor Green
            break
        }
        Write-Host "Not delegated yet (this can take minutes to hours)." -ForegroundColor DarkYellow
        if ((Read-Host "Press Enter to re-check, or type 's' to skip the wait") -eq 's') { break }
    }

    # ============================================================
    # 3. Site stack (S3 + CloudFront + ACM + Route 53 records)
    #    Certificate validation can take several minutes.
    # ============================================================
    Write-Host "`n=== [3/4] Deploying site stack ($SiteStack) — may take 5-10 min ===" -ForegroundColor Cyan
    aws cloudformation deploy `
        --template-file (Join-Path $scriptDir 'site.yaml') `
        --stack-name $SiteStack `
        --region $Region `
        --parameter-overrides DomainName=$DomainName HostedZoneId=$hostedZoneId
}

# ============================================================
# 4. Upload content + invalidate cache
# ============================================================
Write-Host "`n=== [4/4] Uploading site content ===" -ForegroundColor Cyan
$bucket         = Get-Output $SiteStack 'BucketName'
$distributionId = Get-Output $SiteStack 'DistributionId'

if (-not $bucket) { throw "Could not read BucketName from $SiteStack. Has the site stack been deployed?" }

aws s3 sync $repoRoot "s3://$bucket" `
    --delete `
    --exclude '.git/*' `
    --exclude '.claude/*' `
    --exclude 'deploy/*' `
    --exclude 'server.py' `
    --exclude '*.ps1'

Write-Host "Invalidating CloudFront cache..." -ForegroundColor Cyan
aws cloudfront create-invalidation --distribution-id $distributionId --paths '/*' --output text | Out-Null

Write-Host "`nDone. Live at https://$DomainName" -ForegroundColor Green
