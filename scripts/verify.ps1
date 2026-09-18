$ErrorActionPreference = "Stop"

Push-Location "$PSScriptRoot\..\backend"
try {
  mvn test
  if ($LASTEXITCODE -ne 0) { throw "backend verification failed" }
} finally {
  Pop-Location
}

Push-Location "$PSScriptRoot\..\admin"
try {
  npm run format:check
  if ($LASTEXITCODE -ne 0) { throw "admin format check failed" }
  npm test
  if ($LASTEXITCODE -ne 0) { throw "admin tests failed" }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "admin build failed" }
} finally {
  Pop-Location
}

Push-Location "$PSScriptRoot\..\extension"
try {
  npm run format:check
  if ($LASTEXITCODE -ne 0) { throw "extension format check failed" }
  npm test
  if ($LASTEXITCODE -ne 0) { throw "extension tests failed" }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "extension build failed" }
} finally {
  Pop-Location
}
