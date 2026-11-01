// Command genassets renders the demo poster set for the gallery.
//
// Run from the project root:
//
//	go run ./tools/genassets
//
// The posters are deterministic: every id always produces the same artwork, so
// re-running the generator does not change the site.
package main

import (
	"encoding/xml"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"strings"

	"neongallery/internal/gallery"
)

const (
	W      = 1200
	H      = 800
	header = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" role="img" aria-label="%s">`
)

func main() {
	out := flag.String("out", "static/assets", "output directory for the generated posters")
	flag.Parse()

	if err := os.MkdirAll(*out, 0o755); err != nil {
		log.Fatalf("create %s: %v", *out, err)
	}
	for _, it := range gallery.All() {
		name := fmt.Sprintf("poster-%02d.svg", it.ID)
		svg := poster(it)
		if err := validateSVG(svg); err != nil {
			log.Fatalf("%s: generated markup is not well-formed: %v", name, err)
		}
		if err := os.WriteFile(filepath.Join(*out, name), []byte(svg), 0o644); err != nil {
			log.Fatalf("write %s: %v", name, err)
		}
		fmt.Printf("  %-18s %-18s %s\n", name, it.Category, it.Title)
	}
	fmt.Printf("\n%d posters written to %s\n", len(gallery.All()), *out)
}

// validateSVG checks that the generated document is well-formed XML, so a
// broken poster can never reach the browser.
func validateSVG(svg string) error {
	dec := xml.NewDecoder(strings.NewReader(svg))
	for {
		_, err := dec.Token()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
	}
}

// secondary returns the companion hue used for the second light source.
func secondary(cat string) string {
	switch cat {
	case "Neon":
		return "#7c5cff"
	case "City":
		return "#ff3ea5"
	case "Portrait":
		return "#22e6ff"
	case "Abstract":
		return "#38f5c8"
	default:
		return "#b66bff"
	}
}

func poster(it gallery.Item) string {
	rng := rand.New(rand.NewSource(int64(it.ID) * 7919))
	acc := it.Accent
	sec := secondary(it.Category)
	uid := fmt.Sprintf("g%d", it.ID)

	var b []byte
	w := func(f string, args ...any) { b = append(b, fmt.Sprintf(f, args...)...) }

	w(header, W, H, W, H, it.Title)
	w(`<defs>`)
	w(`<linearGradient id="bg%s" x1="0" y1="0" x2="0.4" y2="1">`+
		`<stop offset="0" stop-color="#070b16"/><stop offset="0.55" stop-color="#04060d"/><stop offset="1" stop-color="#010206"/></linearGradient>`, uid)
	w(`<radialGradient id="horizon%s" cx="0.5" cy="1" r="0.8">`+
		`<stop offset="0" stop-color="%s" stop-opacity="0.30"/><stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient>`, uid, acc, acc)
	w(`<radialGradient id="vig%s" cx="0.5" cy="0.48" r="0.75">`+
		`<stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.82"/></radialGradient>`, uid)
	w(`<filter id="soft%s" x="-40%%" y="-40%%" width="180%%" height="180%%"><feGaussianBlur stdDeviation="22"/></filter>`, uid)
	w(`<filter id="mid%s" x="-30%%" y="-30%%" width="160%%" height="160%%"><feGaussianBlur stdDeviation="9"/></filter>`, uid)
	w(`<filter id="grain%s" x="0" y="0" width="100%%" height="100%%">`+
		`<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>`+
		`<feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.35 0"/></filter>`, uid)
	w(`</defs>`)

	w(`<rect width="%d" height="%d" fill="url(#bg%s)"/>`, W, H, uid)
	w(`<rect width="%d" height="%d" fill="url(#horizon%s)"/>`, W, H, uid)

	switch it.Category {
	case "City":
		motifCity(w, rng, uid, acc, sec)
	case "Neon":
		motifNeon(w, rng, uid, acc, sec)
	case "Portrait":
		motifPortrait(w, rng, uid, acc, sec)
	case "Abstract":
		motifAbstract(w, rng, uid, acc, sec)
	default:
		motifNight(w, rng, uid, acc, sec)
	}

	atmosphere(w, rng, uid, acc)
	frame(w, it, uid, acc)
	w(`</svg>`)
	return string(b)
}

// ---------------------------------------------------------------- City ------

func motifCity(w func(string, ...any), rng *rand.Rand, uid, acc, sec string) {
	hz := 470.0

	// horizon glow behind the skyline
	w(`<g filter="url(#soft%s)">`, uid)
	w(`<rect x="0" y="%.0f" width="%d" height="90" fill="%s" fill-opacity="0.30"/>`, hz-70, W, acc)
	w(`<rect x="%.0f" y="%.0f" width="%.0f" height="60" fill="%s" fill-opacity="0.22"/>`, W*0.1, hz-50, W*0.5, sec)
	w(`</g>`)

	// ground grid in perspective
	w(`<g stroke="%s" stroke-opacity="0.28" stroke-width="1.2">`, acc)
	for i := 1; i <= 14; i++ {
		y := hz + math.Pow(float64(i)/14, 2.1)*(H-hz)
		w(`<line x1="0" y1="%.0f" x2="%d" y2="%.0f"/>`, y, W, y)
	}
	for i := -12; i <= 12; i++ {
		x := W/2 + float64(i)*70
		w(`<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%d"/>`, W/2+float64(i)*24, hz, x, H)
	}
	w(`</g>`)

	// skyline layers, far to near
	layers := []struct {
		y       float64
		max     float64
		fill    string
		opacity float64
		step    float64
	}{
		{hz - 130, 130, "#1a2947", 0.85, 92},
		{hz - 60, 200, "#0e1830", 0.95, 132},
		{hz, 260, "#070d1a", 1, 190},
	}
	for _, L := range layers {
		x := -40.0
		w(`<g>`)
		for x < W+40 {
			hw := L.step * (0.55 + rng.Float64()*0.65)
			hh := L.max * (0.35 + rng.Float64()*0.65)
			y := L.y - hh
			w(`<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" fill="%s" fill-opacity="%.2f"/>`, x, y, hw, hh+80, L.fill, L.opacity)
			w(`<rect x="%.0f" y="%.0f" width="%.0f" height="2.5" fill="%s" fill-opacity="0.7"/>`, x, y, hw, acc)
			w(`<rect x="%.0f" y="%.0f" width="2" height="%.0f" fill="%s" fill-opacity="0.35"/>`, x, y, hh, sec)
			// lit windows
			for k := 0; k < int(hw*hh/1700)+4; k++ {
				wx := x + 6 + rng.Float64()*(hw-14)
				wy := y + 10 + rng.Float64()*(hh-20)
				c := acc
				if rng.Float64() < 0.35 {
					c = sec
				}
				w(`<rect x="%.0f" y="%.0f" width="%.0f" height="3.5" fill="%s" fill-opacity="%.2f"/>`, wx, wy, 3+rng.Float64()*7, c, 0.35+rng.Float64()*0.55)
			}
			// antenna beacon
			if rng.Float64() < 0.3 {
				bx := x + hw/2
				w(`<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="%s" stroke-opacity="0.5"/>`, bx, y, bx, y-34, sec)
				w(`<circle cx="%.0f" cy="%.0f" r="4" fill="%s" filter="url(#mid%s)"/>`, bx, y-36, sec, uid)
			}
			x += hw + 14 + rng.Float64()*26
		}
		w(`</g>`)
	}

	// traffic light trails
	w(`<g stroke-linecap="round" filter="url(#mid%s)">`, uid)
	for i := 0; i < 16; i++ {
		y := hz + 20 + rng.Float64()*(H-hz-40)
		x0 := rng.Float64() * W * 0.7
		length := 90 + rng.Float64()*420
		c := acc
		if i%3 == 0 {
			c = sec
		}
		w(`<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="%s" stroke-width="%.1f" stroke-opacity="%.2f"/>`,
			x0, y, x0+length, y, c, 1.5+rng.Float64()*3.5, 0.35+rng.Float64()*0.45)
	}
	w(`</g>`)

	// vertical search beams
	w(`<g opacity="0.5" filter="url(#soft%s)">`, uid)
	for i := 0; i < 3; i++ {
		x := 120 + rng.Float64()*(W-240)
		w(`<path d="M%.0f %d L%.0f %.0f L%.0f %.0f Z" fill="%s" fill-opacity="0.18"/>`,
			x-26, H, x+8, hz-180, x+34, H, sec)
	}
	w(`</g>`)
}

// ---------------------------------------------------------------- Neon ------

func motifNeon(w func(string, ...any), rng *rand.Rand, uid, acc, sec string) {
	// wall panel structure
	w(`<g stroke="#13203a" stroke-opacity="0.85" stroke-width="1.5">`)
	for x := 0.0; x < W; x += 60 {
		w(`<line x1="%.0f" y1="0" x2="%.0f" y2="%d"/>`, x, x, H)
	}
	for y := 0.0; y < H; y += 60 {
		w(`<line x1="0" y1="%.0f" x2="%d" y2="%.0f"/>`, y, W, y)
	}
	w(`</g>`)

	// glowing tubes: halo pass then core pass
	type tube struct {
		d  string
		c  string
		bw float64
		cw float64
	}
	tubes := []tube{}
	for i := 0; i < 7; i++ {
		x0 := 90 + rng.Float64()*(W-260)
		y0 := 90 + rng.Float64()*(H-260)
		rr := 60 + rng.Float64()*190
		switch i % 3 {
		case 0:
			tubes = append(tubes, tube{
				fmt.Sprintf("M%.0f %.0f a%.0f %.0f 0 1 1 %.0f 0 a%.0f %.0f 0 1 1 %.0f 0 Z",
					x0-rr, y0, rr, rr*0.72, 2*rr, rr, rr*0.72, -2*rr),
				pick(rng, acc, sec), 30, 7})
		case 1:
			x1 := x0 + 140 + rng.Float64()*260
			y1 := y0 + (rng.Float64()-0.5)*300
			tubes = append(tubes, tube{
				fmt.Sprintf("M%.0f %.0f C%.0f %.0f %.0f %.0f %.0f %.0f",
					x0, y0, x0+120, y0-150, x1-120, y1+150, x1, y1),
				pick(rng, acc, sec), 26, 6})
		default:
			tubes = append(tubes, tube{
				fmt.Sprintf("M%.0f %.0f h%.0f v%.0f h%.0f v%.0f",
					x0, y0, 120+rng.Float64()*180, 70+rng.Float64()*140, -(60 + rng.Float64()*120), 60+rng.Float64()*120),
				pick(rng, sec, acc), 22, 5})
		}
	}
	for _, t := range tubes {
		w(`<g fill="none" stroke-linecap="round" stroke-linejoin="round">`)
		w(`<path d="%s" stroke="%s" stroke-width="%.0f" stroke-opacity="0.28" filter="url(#soft%s)"/>`, t.d, t.c, t.bw, uid)
		w(`<path d="%s" stroke="%s" stroke-width="%.0f" stroke-opacity="0.55" filter="url(#mid%s)"/>`, t.d, t.c, t.cw*2, uid)
		w(`<path d="%s" stroke="#eafaff" stroke-width="%.1f" stroke-opacity="0.9"/>`, t.d, t.cw)
		w(`</g>`)
	}

	// signage glyph blocks
	w(`<g fill="%s" fill-opacity="0.75">`, acc)
	for i := 0; i < 22; i++ {
		x := 120 + rng.Float64()*(W-300)
		y := 110 + rng.Float64()*(H-260)
		w(`<rect x="%.0f" y="%.0f" width="%.0f" height="5" rx="2"/>`, x, y, 8+rng.Float64()*40)
	}
	w(`</g>`)

	// reflection pool at the bottom
	w(`<g opacity="0.35" filter="url(#soft%s)">`, uid)
	for _, t := range tubes[:4] {
		w(`<path d="%s" fill="none" stroke="%s" stroke-width="18" transform="translate(0,%.0f) scale(1,-1)"/>`,
			t.d, t.c, float64(H)*1.35)
	}
	w(`</g>`)
}

// ------------------------------------------------------------ Portrait ------

func motifPortrait(w func(string, ...any), rng *rand.Rand, uid, acc, sec string) {
	cx, cy := 600.0, 430.0

	// halo
	w(`<g filter="url(#soft%s)">`, uid)
	w(`<circle cx="%.0f" cy="%.0f" r="250" fill="%s" fill-opacity="0.16"/>`, cx, cy-150, acc)
	w(`<circle cx="%.0f" cy="%.0f" r="170" fill="%s" fill-opacity="0.12"/>`, cx, cy-150, sec)
	w(`</g>`)

	// bust: shoulders, neck, head — rim lit from the left
	shoulders := fmt.Sprintf("M%.0f %d C%.0f %.0f %.0f %.0f %.0f %.0f C%.0f %.0f %.0f %.0f %.0f %d Z",
		cx-390, H, cx-350, cy+300, cx-190, cy+215, cx, cy+205,
		cx+190, cy+215, cx+350, cy+300, cx+390, H)
	head := fmt.Sprintf("M%.0f %.0f C%.0f %.0f %.0f %.0f %.0f %.0f C%.0f %.0f %.0f %.0f %.0f %.0f C%.0f %.0f %.0f %.0f %.0f %.0f Z",
		cx-152, cy-120,
		cx-152, cy-290, cx+152, cy-290, cx+152, cy-120,
		cx+152, cy+30, cx+80, cy+125, cx, cy+125,
		cx-80, cy+125, cx-152, cy+30, cx-152, cy-120)
	neck := fmt.Sprintf("M%.0f %.0f h%d v%d h%d Z", cx-62, cy+95, 124, 130, -124)

	for _, shape := range []string{shoulders, neck, head} {
		w(`<path d="%s" fill="#070c17"/>`, shape)
	}
	for _, shape := range []string{shoulders, neck, head} {
		w(`<path d="%s" fill="none" stroke="%s" stroke-width="24" stroke-opacity="0.26" filter="url(#soft%s)"/>`, shape, acc, uid)
		w(`<path d="%s" fill="none" stroke="%s" stroke-width="8" stroke-opacity="0.5" filter="url(#mid%s)"/>`, shape, acc, uid)
		w(`<path d="%s" fill="none" stroke="#dff8ff" stroke-width="2.2" stroke-opacity="0.85"/>`, shape)
	}

	// visor band across the eyes
	vx, vy, vw, vh := cx-132, cy-160, 264, 54
	w(`<g>`)
	w(`<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" rx="16" fill="%s" fill-opacity="0.18"/>`, vx, vy, vw, vh, acc)
	w(`<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" rx="16" fill="%s" filter="url(#mid%s)" opacity="0.4"/>`, vx, vy, vw, vh, sec, uid)
	w(`<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" rx="16" fill="none" stroke="%s" stroke-width="2" stroke-opacity="0.75"/>`, vx, vy, vw, vh, acc)
	for i := 0; i < 7; i++ {
		bx := vx + 24 + float64(i)*30 + rng.Float64()*6
		w(`<rect x="%.0f" y="%.0f" width="10" height="%.0f" rx="3" fill="#eafaff" fill-opacity="0.6"/>`, bx, vy+10, 16+rng.Float64()*24)
	}
	w(`</g>`)

	// hud rings around the face
	w(`<g fill="none" stroke="%s" stroke-opacity="0.35">`, sec)
	for i, r := range []float64{210, 268, 330} {
		a0 := rng.Float64() * 360
		w(`<path d="%s" stroke-width="1.4" stroke-dasharray="%.0f %.0f"/>`,
			arc(cx, cy-130, r, a0, a0+120+float64(i)*40), 6+float64(i)*10, 12+float64(i)*8)
	}
	w(`</g>`)

	// scanlines
	w(`<g stroke="#9fd8ff" stroke-opacity="0.08">`)
	for y := 60.0; y < H-40; y += 6 {
		w(`<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f"/>`, cx-260, y, cx+260, y)
	}
	w(`</g>`)
}

// ------------------------------------------------------------ Abstract ----

func motifAbstract(w func(string, ...any), rng *rand.Rand, uid, acc, sec string) {
	w(`<g opacity="0.55" filter="url(#soft%s)">`, uid)
	for i := 0; i < 6; i++ {
		w(`<circle cx="%.0f" cy="%.0f" r="%.0f" fill="%s" fill-opacity="0.22"/>`,
			150+rng.Float64()*(W-300), 120+rng.Float64()*(H-240), 90+rng.Float64()*180, pick(rng, acc, sec))
	}
	w(`</g>`)

	// flowing ribbons
	for i := 0; i < 7; i++ {
		y := 120 + float64(i)*(H-240)/6 + (rng.Float64()-0.5)*70
		c := pick(rng, acc, sec)
		d := fmt.Sprintf("M-40 %.0f C%.0f %.0f %.0f %.0f %d %.0f",
			y, W*0.28, y-190+rng.Float64()*180, W*0.68, y+190-rng.Float64()*180, W+40, y+(rng.Float64()-0.5)*120)
		w(`<g fill="none" stroke-linecap="round">`)
		w(`<path d="%s" stroke="%s" stroke-width="46" stroke-opacity="0.16" filter="url(#soft%s)"/>`, d, c, uid)
		w(`<path d="%s" stroke="%s" stroke-width="12" stroke-opacity="0.5" filter="url(#mid%s)"/>`, d, c, uid)
		w(`<path d="%s" stroke="#ecfdff" stroke-width="2.2" stroke-opacity="0.75"/>`, d)
		w(`</g>`)
	}

	// concentric rings
	cx, cy := 300+rng.Float64()*600, 260+rng.Float64()*280
	w(`<g fill="none" stroke="%s" stroke-opacity="0.4">`, acc)
	for i := 1; i <= 8; i++ {
		w(`<circle cx="%.0f" cy="%.0f" r="%.0f" stroke-width="%.1f" stroke-dasharray="%.0f %.0f"/>`,
			cx, cy, float64(i)*34, 0.6+float64(i%3)*0.7, 40+float64(i)*14, 16+float64(i)*6)
	}
	w(`</g>`)

	// particle dust
	w(`<g fill="#dff6ff">`)
	for i := 0; i < 160; i++ {
		w(`<circle cx="%.0f" cy="%.0f" r="%.1f" fill-opacity="%.2f"/>`,
			rng.Float64()*W, rng.Float64()*H, 0.6+rng.Float64()*2.4, 0.1+rng.Float64()*0.5)
	}
	w(`</g>`)
}

// --------------------------------------------------------------- Night ------

func motifNight(w func(string, ...any), rng *rand.Rand, uid, acc, sec string) {
	// stars
	w(`<g fill="#dff2ff">`)
	for i := 0; i < 220; i++ {
		y := rng.Float64() * 520
		w(`<circle cx="%.0f" cy="%.0f" r="%.1f" fill-opacity="%.2f"/>`,
			rng.Float64()*W, y, 0.5+rng.Float64()*1.8, 0.12+rng.Float64()*0.6)
	}
	w(`</g>`)

	// moon + rings
	mx, my := 260+rng.Float64()*700, 150+rng.Float64()*140
	w(`<g filter="url(#soft%s)">`, uid)
	w(`<circle cx="%.0f" cy="%.0f" r="96" fill="%s" fill-opacity="0.30"/>`, mx, my, acc)
	w(`</g>`)
	w(`<circle cx="%.0f" cy="%.0f" r="62" fill="#e9f6ff" fill-opacity="0.92"/>`, mx, my)
	w(`<circle cx="%.0f" cy="%.0f" r="62" fill="none" stroke="%s" stroke-width="3" stroke-opacity="0.7"/>`, mx, my, acc)
	w(`<g fill="none" stroke="%s" stroke-opacity="0.30">`, sec)
	for i := 1; i <= 3; i++ {
		w(`<ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f" stroke-width="1.2"/>`, mx, my, 100+float64(i)*58, 22+float64(i)*10)
	}
	w(`</g>`)

	// mountain ridges, far to near
	ridges := []struct {
		base float64
		amp  float64
		fill string
	}{
		{560, 120, "#0b1428"},
		{630, 160, "#060c1a"},
		{720, 120, "#02040a"},
	}
	for _, R := range ridges {
		d := fmt.Sprintf("M0 %d L0 %.0f", H, R.base)
		for x := 0.0; x <= W; x += 60 + rng.Float64()*40 {
			d += fmt.Sprintf(" L%.0f %.0f", x, R.base-rng.Float64()*R.amp)
		}
		d += fmt.Sprintf(" L%d %.0f Z", W, R.base)
		w(`<path d="%s" fill="%s"/>`, d, R.fill)
	}

	// ridge rim light
	w(`<path d="M0 640 L%.0f %.0f L%.0f %.0f L%.0f %.0f L%d 660" fill="none" stroke="%s" stroke-width="2" stroke-opacity="0.55" filter="url(#mid%s)"/>`,
		W*0.22, 520-rng.Float64()*60, W*0.5, 596-rng.Float64()*40, W*0.78, 500-rng.Float64()*70, W, acc, uid)

	// fog bands
	w(`<g filter="url(#soft%s)" opacity="0.5">`, uid)
	for i := 0; i < 5; i++ {
		y := 560 + float64(i)*48
		w(`<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" fill="%s" fill-opacity="0.14"/>`,
			-rng.Float64()*200, y, 700+rng.Float64()*700, 26+rng.Float64()*30, sec)
	}
	w(`</g>`)

	// lone light on the ridge line
	lx := 120 + rng.Float64()*(W-240)
	w(`<g filter="url(#mid%s)">`, uid)
	w(`<circle cx="%.0f" cy="%.0f" r="6" fill="%s"/>`, lx, 690, acc)
	w(`<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="%s" stroke-width="2" stroke-opacity="0.4"/>`, lx-90, 706, lx+90, 674, acc)
	w(`</g>`)
}

// ------------------------------------------------------------ shared --------

func atmosphere(w func(string, ...any), rng *rand.Rand, uid, acc string) {
	// drifting haze
	w(`<g filter="url(#soft%s)">`, uid)
	for i := 0; i < 5; i++ {
		w(`<ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f" fill="%s" fill-opacity="0.07"/>`,
			rng.Float64()*W, 200+rng.Float64()*600, 200+rng.Float64()*320, 60+rng.Float64()*140, acc)
	}
	w(`</g>`)

	// light beams from the top
	w(`<g opacity="0.20">`)
	for i := 0; i < 2; i++ {
		x := 150 + rng.Float64()*(W-300)
		w(`<path d="M%.0f -40 L%.0f %.0f L%.0f %.0f L%.0f -40 Z" fill="url(#horizon%s)" transform="translate(0,0)"/>`,
			x-40, x-170, H, x+170, H, x+40, uid)
	}
	w(`</g>`)

	// grain + vignette
	w(`<rect width="%d" height="%d" filter="url(#grain%s)" opacity="0.10"/>`, W, H, uid)
	w(`<rect width="%d" height="%d" fill="url(#vig%s)"/>`, W, H, uid)
}

func frame(w func(string, ...any), it gallery.Item, uid, acc string) {
	t := 34.0
	w(`<g stroke="%s" stroke-opacity="0.5" stroke-width="2" fill="none">`, acc)
	w(`<path d="M28 %.0f V28 H%.0f"/>`, t, 28+t)
	w(`<path d="M%d %.0f H%d V%d"/>`, W-28, t, W-28-t, 28+t)
	w(`<path d="M28 %.0f V%.0f H%.0f"/>`, H-28, H-28-t, 28+t)
	w(`<path d="M%d %.0f H%.0f V%.0f"/>`, W-28, H-28, W-28-t, H-28-t)
	w(`</g>`)

	w(`<g font-family="DejaVu Sans Mono, monospace" fill="#cfe9ff" fill-opacity="0.72">`)
	w(`<text x="46" y="66" font-size="19" letter-spacing="4">NG-%02d</text>`, it.ID)
	w(`<text x="%d" y="66" font-size="15" letter-spacing="6" text-anchor="end" fill="%s" fill-opacity="0.8">%s</text>`, W-46, acc, upper(it.Category))
	w(`<text x="46" y="%d" font-size="14" letter-spacing="3" fill-opacity="0.5">%s</text>`, H-46, upper(it.Author))
	w(`</g>`)

	// accent bar bottom-left
	w(`<rect x="46" y="%d" width="120" height="3" fill="%s" filter="url(#mid%s)" opacity="0.8"/>`, H-70, acc, uid)
}

func arc(cx, cy, r, a0, a1 float64) string {
	p := func(a float64) string {
		x := cx + r*math.Cos(a*math.Pi/180)
		y := cy + r*math.Sin(a*math.Pi/180)
		return fmt.Sprintf("%.1f %.1f", x, y)
	}
	large := 0
	if a1-a0 > 180 {
		large = 1
	}
	return fmt.Sprintf("M%s A%.0f %.0f 0 %d 1 %s", p(a0), r, r, large, p(a1))
}

func pick(rng *rand.Rand, a, b string) string {
	if rng.Float64() < 0.5 {
		return a
	}
	return b
}

func upper(s string) string {
	out := []byte(s)
	for i := range out {
		if out[i] >= 'a' && out[i] <= 'z' {
			out[i] -= 32
		}
	}
	return string(out)
}
