# NEON GALLERY 3D — Security Check & Public Deployment

**Project:** https://github.com/Fort-fog/NEON_GALLERY
**Check date:** 2026-11-01
**Status:** preliminary local security check; **not** a penetration test or a certification that the site is secure.

## Scope and evidence

This report documents checks performed by the project owner on the local Go gallery at `127.0.0.1:8080`, together with a source review of the supplied Go server entry point. The public production server has **not** been configured or tested. The checked local version and the future deployed version must be compared before deployment.

| Check | Observed result | Meaning / limitation |
| --- | --- | --- |
| `go build ./...` | Exit 0 | Go project builds. |
| `go vet ./...` | Exit 0 | No issues reported by this vet run. |
| `go test ./... -count=1` | Exit 0; all three packages reported `[no test files]` | Compilation succeeded; **no automated tests were run**. |
| `node --check static/app.js` | No syntax error reported | Syntax check, not a security audit. |
| App-specific grep for `innerHTML`, `eval`, etc. | No matches reported | Limited static pattern check; does not prove absence of XSS. |
| `GET /` | HTTP 200 | Main page served. |
| `GET /api/health` | JSON `{"items":16,"status":"ok",...}` | API was healthy during the local check. |
| `POST /api/gallery` | HTTP 405 | This route rejects POST. |
| `GET /../../go.mod` with `--path-as-is` | HTTP 301 to `/go.mod`, then HTTP 404 | The tested traversal did not expose `go.mod`. |
| `GET /go.mod` | HTTP 404 | The file outside `static/` was not served by this route. |

**Not established:** comprehensive XSS testing, full dependency vulnerability analysis, HTTP request fuzzing, denial-of-service resilience, production TLS configuration, security of deployment host, or absence of other file disclosure paths.

### Source observations

- The supplied `main.go` uses the Go standard-library HTTP server, serves the `static` directory, and exposes `/api/gallery` and `/api/health`.
- It defaults to `127.0.0.1:8080` but supports the `-addr` option, so a different local-only port can be selected without modifying application code.
- `ReadHeaderTimeout` is set to 5 seconds. Other connection timeouts should be evaluated for public deployment; use proxy limits where appropriate.
- Local HTTP responses inspected did **not** contain a `Content-Security-Policy`, `X-Content-Type-Options`, or `Referrer-Policy` header. This is a hardening opportunity, not by itself proof of exploitability.
- `static/vendor/three.min.js` is vendored third-party JavaScript. Verify its exact version, integrity and licensing notices before public release; do **not** assume a dependency is vulnerability-free without a current advisory check.

## Required before publishing on an internet-facing server

**Recommended architecture:** `Internet → existing HTTPS reverse proxy → Go application listening on 127.0.0.1:<free-port>`.

1. **Use the existing web server if available.** Identify whether the host already runs Nginx, Caddy, Apache, or a hosting-panel proxy. Do not install a second stack without a reason, and do not disrupt other hosted services.
2. **Choose a domain or subdomain.** Point DNS A/AAAA records to the server as appropriate. Confirm public reachability and that the domain resolves correctly.
3. **Use an unoccupied internal port** (for example `127.0.0.1:18555`, **only if free**) for the Go app. Keep it bound to localhost; do not expose that port in the public firewall. Check occupancy before using it.
4. **Enable HTTPS with Let's Encrypt.** Obtain a certificate through the existing proxy's ACME integration (if available) or an ACME client such as Certbot. Domain validation must work; depending on the method, public ports 80 and/or 443 and DNS may be required. Do not overwrite certificates or virtual-host configuration belonging to other sites.
5. **Configure automatic certificate renewal** and test that renewal is functional, including any required web-server reload. Merely obtaining the first certificate is not sufficient.
6. **Redirect HTTP to HTTPS** and enable modern TLS settings on the reverse proxy. Add HSTS only after HTTPS has been verified for the domain and any affected subdomains.
7. **Add response hardening headers at the proxy.** Start with `X-Content-Type-Options: nosniff` and an appropriate `Referrer-Policy`. Build and test a **site-specific** CSP against the actual inline scripts/styles, Three.js rendering, images, and WebGL needs; do not paste a restrictive CSP blindly and break the gallery.
8. **Constrain request resources.** Review proxy request-size limits, timeouts, concurrency and connection handling. The app currently serves a public read-only gallery, but this does not eliminate availability risks.
9. **Run Go as an unprivileged service** (for example with the existing init/service manager). Use a dedicated service account and read-only access to application assets where practical. Never run it as root just to bind a low port; the proxy handles public 80/443.
10. **Check the deployment directory.** No secrets, `.git`, developer files, unexpected symlinks, backup files, or writable user uploads should appear inside the served `static/` tree. Keep `go.mod` and application source outside the web root.
11. **Verify third-party notices** for the vendored Three.js file; keep required copyright and license notices when distributing the library.
12. **Repeat functional and security checks on the deployed URL** with the real domain: HTTPS certificate/chain, redirects, response headers, API, SVG files, 3D rendering, browser console, mobile layout, and paths outside `static/`. Check relevant server logs after tests.

### Minimal post-deployment acceptance criteria

- [ ] DNS resolves to the intended server.
- [ ] HTTPS is valid and HTTP redirects to HTTPS.
- [ ] Certificate renewal is configured and tested.
- [ ] Go app listens on localhost on a verified free port, behind the existing proxy.
- [ ] Public site and `/api/gallery` work; `/api/health` responds as intended.
- [ ] All 16 posters load; Three.js 3D gallery works in a real browser.
- [ ] `/go.mod` and the tested traversal path do not reveal project files.
- [ ] HTTP method restrictions remain effective.
- [ ] Security headers are present and do not break the gallery.
- [ ] App runs unprivileged; logs and restart behavior checked.
- [ ] No unintended ports or services have been exposed.

## Decisions / limitations

This document is a **deployment checklist**, not proof that the production site is secure. No server configuration has been changed, no certificate has been issued, and no external site has been deployed as part of this report. The correct proxy configuration and ACME procedure depend on the actual server environment and domain.

## References

- Let's Encrypt: https://letsencrypt.org/getting-started/
- Let's Encrypt ACME clients: https://letsencrypt.org/docs/client-options/
- Go HTTP server documentation: https://pkg.go.dev/net/http
- Original project: https://github.com/Fort-fog/NEON_GALLERY
