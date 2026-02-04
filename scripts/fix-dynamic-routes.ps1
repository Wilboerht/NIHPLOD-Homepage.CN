# Batch add dynamic = 'force-dynamic' to all API routes
# Fix Vercel build static prerender errors

$apiDir = "c:\Users\hongk\Desktop\nihplod.cn - master\src\app\api"
$routeFiles = Get-ChildItem -Path $apiDir -Recurse -Filter "route.ts"

$count = 0
$skipped = 0

foreach ($file in $routeFiles) {
    $content = Get-Content -Path $file.FullName -Raw
    
    # Check if dynamic export already exists
    if ($content -match "export\s+(const|var|let)\s+dynamic\s*=") {
        Write-Host "Skipped (exists): $($file.FullName)"
        $skipped++
        continue
    }
    
    # Add dynamic config before the first export function
    if ($content -match "(?s)(.*?)(export\s+(async\s+)?function)") {
        $beforeExport = $matches[1]
        $exportPart = $matches[2]
        $afterExport = $content.Substring($beforeExport.Length + $exportPart.Length)
        
        $dynamicConfig = "`n// Force dynamic rendering`nexport const dynamic = 'force-dynamic';`n`n"
        $newContent = $beforeExport + $dynamicConfig + $exportPart + $afterExport
        
        Set-Content -Path $file.FullName -Value $newContent -NoNewline
        Write-Host "Updated: $($file.FullName)"
        $count++
    } else {
        Write-Host "Cannot process: $($file.FullName)"
    }
}

Write-Host ""
Write-Host "Done! Updated $count files, skipped $skipped files"
