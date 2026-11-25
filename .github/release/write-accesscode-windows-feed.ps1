param(
    [Parameter(Mandatory)][string]$Directory,
    [Parameter(Mandatory)][string]$Version,
    [Parameter(Mandatory)][string]$PublisherSubject
)

$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw 'The latest Windows update feed requires a stable version (major.minor.patch).'
}

$files = foreach ($arch in @('x64')) {
    $file = Get-Item -LiteralPath (Join-Path $Directory "accesscode-desktop-win-$arch.exe")
    $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -cne $PublisherSubject) {
        throw "Unexpected or invalid Authenticode signature on $($file.Name)."
    }

    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA512).Hash
    @{
        url = $file.Name
        sha512 = [Convert]::ToBase64String([Convert]::FromHexString($hash))
        size = $file.Length
    }
}

@{
    version = $Version
    releaseDate = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    files = @($files)
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $Directory 'latest.yml') -Encoding utf8NoBOM
