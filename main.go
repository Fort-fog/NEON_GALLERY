// Command neongallery serves the "Неон фотогалерея 3D" single page app and its
// gallery API. It only uses the Go standard library.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"neongallery/internal/gallery"
)

const assetDir = "static"

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "address to listen on")
	open := flag.Bool("open", false, "open the site in the default browser after start")
	flag.Parse()

	root, err := os.Getwd()
	if err != nil {
		log.Fatalf("resolve working directory: %v", err)
	}
	staticRoot := filepath.Join(root, assetDir)
	if _, err := os.Stat(staticRoot); err != nil {
		log.Fatalf("static directory %q not found — run the server from the project root (go run .): %v", staticRoot, err)
	}

	srv := &http.Server{
		Addr:              *addr,
		Handler:           loquacious(newMux(staticRoot)),
		ReadHeaderTimeout: 5 * time.Second,
		ErrorLog:          log.New(os.Stderr, "[neongallery] ", log.LstdFlags),
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen on %s: %v", *addr, err)
		}
	}()

	url := "http://" + *addr
	fmt.Printf("\n  NEON GALLERY 3D\n  ready at %s\n  api:   %s/api/gallery\n  press Ctrl+C to stop\n\n", url, url)

	if *open {
		go openBrowser(url)
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("shutdown: %v", err)
	}
	fmt.Println("server stopped")
}

// newMux wires the API routes and the static file server.
func newMux(staticRoot string) *http.ServeMux {
	mux := http.NewServeMux()

	files := http.FileServer(http.Dir(staticRoot))
	mux.Handle("/", cacheControl(files, map[string]string{
		"/vendor/": "public, max-age=86400",
		"/assets/": "public, max-age=86400",
	}))

	mux.HandleFunc("/api/gallery", handleGallery)
	mux.HandleFunc("/api/health", handleHealth)
	return mux
}

func handleGallery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "use GET")
		return
	}
	q := r.URL.Query()
	resp := gallery.BuildResponse(q.Get("category"), q.Get("q"))
	writeJSON(w, http.StatusOK, resp)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
		"items":  len(gallery.All()),
		"time":   time.Now().Format(time.RFC3339),
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode response: %v", err)
	}
}

func writeJSONError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// cacheControl adds long lived caching for immutable assets while keeping the
// HTML shell fresh.
func cacheControl(next http.Handler, rules map[string]string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for prefix, value := range rules {
			if strings.HasPrefix(r.URL.Path, prefix) {
				w.Header().Set("Cache-Control", value)
				break
			}
		}
		if r.URL.Path == "/" || strings.HasSuffix(r.URL.Path, ".html") {
			w.Header().Set("Cache-Control", "no-cache")
		}
		next.ServeHTTP(w, r)
	})
}

// loquacious logs a compact line per request so the terminal stays readable.
func loquacious(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		if r.URL.Path != "/" && !strings.HasPrefix(r.URL.Path, "/assets/") && !strings.HasPrefix(r.URL.Path, "/vendor/") {
			log.Printf("%3d %13s %s", rec.status, time.Since(start).Round(time.Microsecond), r.URL.RequestURI())
		}
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// openBrowser tries the usual platform helper; failure is not fatal.
func openBrowser(url string) {
	for _, name := range []string{"xdg-open", "open"} {
		path, err := exec.LookPath(name)
		if err != nil {
			continue
		}
		if err := exec.Command(path, url).Run(); err != nil {
			log.Printf("open browser: %v", err)
		}
		return
	}
	fmt.Println("(no browser helper found — open the URL manually)")
}
