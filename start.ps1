# Octagon ERP System - PowerShell HTTP Server
# Run with: powershell -ExecutionPolicy Bypass -File start.ps1
# Then open: http://localhost:3000

$Port = 8088
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

Write-Host ""
Write-Host "  Octagon ERP System" -ForegroundColor Cyan
Write-Host "  ========================" -ForegroundColor DarkCyan
Write-Host "  Server running at: " -NoNewline
Write-Host "http://localhost:$Port" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop" -ForegroundColor DarkGray
Write-Host ""

$MimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq "/") { $urlPath = "/index.html" }

        $filePath = Join-Path $Root $urlPath.TrimStart("/")

        if ($urlPath -eq "/api/db") {
            $response.ContentType = "application/json; charset=utf-8"
            if ($request.HttpMethod -eq "GET") {
                $dbPath = Join-Path $Root "database.json"
                if (Test-Path $dbPath) {
                    $content = [System.IO.File]::ReadAllBytes($dbPath)
                    $response.ContentLength64 = $content.Length
                    $response.OutputStream.Write($content, 0, $content.Length)
                    Write-Host "  [200 GET] /api/db" -ForegroundColor Green
                } else {
                    $response.StatusCode = 404
                    $msg = [System.Text.Encoding]::UTF8.GetBytes('{"error": "database.json not found"}')
                    $response.ContentLength64 = $msg.Length
                    $response.OutputStream.Write($msg, 0, $msg.Length)
                    Write-Host "  [404 GET] /api/db" -ForegroundColor Red
                }
            } elseif ($request.HttpMethod -eq "POST") {
                try {
                    $reader = [System.IO.StreamReader]::new($request.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $reader.Close()
                    
                    $dbPath = Join-Path $Root "database.json"
                    $parsed = ConvertFrom-Json $body -ErrorAction SilentlyContinue
                    
                    if ($parsed -and ($null -ne $parsed.employees) -and ($parsed.employees.Count -eq 0) -and (Test-Path $dbPath)) {
                        $existingText = [System.IO.File]::ReadAllText($dbPath, [System.Text.Encoding]::UTF8)
                        $existing = ConvertFrom-Json $existingText -ErrorAction SilentlyContinue
                        if ($existing -and ($null -ne $existing.employees) -and ($existing.employees.Count -gt 0)) {
                            Write-Host "  [WARNING] Refusing to wipe employees list in database.json; preserving existing." -ForegroundColor Yellow
                            $parsed.employees = $existing.employees
                            $body = ConvertTo-Json $parsed -Depth 20
                        }
                    }
                    
                    # Write to database.json atomically (without BOM)
                    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
                    [System.IO.File]::WriteAllText($dbPath, $body, $utf8NoBom)
                    
                    # Respond to client
                    $msg = [System.Text.Encoding]::UTF8.GetBytes('{"success": true}')
                    $response.ContentLength64 = $msg.Length
                    $response.OutputStream.Write($msg, 0, $msg.Length)
                    Write-Host "  [200 POST] /api/db" -ForegroundColor Green
                } catch {
                    $response.StatusCode = 500
                    $msg = [System.Text.Encoding]::UTF8.GetBytes('{"success": false, "error": "Internal server error"}')
                    $response.ContentLength64 = $msg.Length
                    $response.OutputStream.Write($msg, 0, $msg.Length)
                    Write-Host "  [500 POST] /api/db error: $_" -ForegroundColor Red
                }
            }
        } elseif (Test-Path $filePath) {
            $ext = [System.IO.Path]::GetExtension($filePath)
            $contentType = $MimeTypes[$ext]
            if (-not $contentType) { $contentType = "application/octet-stream" }

            $response.ContentType = $contentType
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
            Write-Host "  [200] $urlPath" -ForegroundColor Green
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("<h1>404 - Not Found</h1>")
            $response.ContentType = "text/html; charset=utf-8"
            $response.ContentLength64 = $msg.Length
            $response.OutputStream.Write($msg, 0, $msg.Length)
            Write-Host "  [404] $urlPath" -ForegroundColor Red
        }

        $response.Close()
    }
} finally {
    $listener.Stop()
    Write-Host "`n  Server stopped." -ForegroundColor Yellow
}
