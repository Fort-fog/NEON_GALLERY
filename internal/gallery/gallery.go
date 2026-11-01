// Package gallery holds the demo dataset of the neon photo gallery and the
// filtering logic exposed through the HTTP API.
package gallery

import (
	"fmt"
	"sort"
	"strings"
)

// Item is a single gallery card as it is served to the frontend.
type Item struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	Category    string `json:"category"`
	Description string `json:"description"`
	Author      string `json:"author"`
	Year        int    `json:"year"`
	Accent      string `json:"accent"`
	Image       string `json:"image"`
	Width       int    `json:"w"`
	Height      int    `json:"h"`
}

// Response is the JSON payload returned by /api/gallery.
type Response struct {
	Items      []Item   `json:"items"`
	Categories []string `json:"categories"`
	Total      int      `json:"total"`
	Count      int      `json:"count"`
	Query      string   `json:"query"`
	Category   string   `json:"category"`
}

// ImageWidth / ImageHeight match the generated SVG posters.
const (
	ImageWidth  = 1200
	ImageHeight = 800
)

// Categories are listed in display order.
var Categories = []string{"Neon", "City", "Portrait", "Abstract", "Night"}

var items = []Item{
	{ID: 1, Title: "Chrome Mirage", Category: "Neon", Author: "V. Kestrel", Year: 2087, Accent: "#22e6ff",
		Description: "Хромовая арка в квартале Си-Тек: отражения неона дробятся о мокрый асфальт и виснут в воздухе."},
	{ID: 2, Title: "Rain Circuit", Category: "City", Author: "M. Oduya", Year: 2086, Accent: "#4f8cff",
		Description: "Поток трафика над перекрёстком 44-B. Долгая выдержка превращает магистрали в схему платы."},
	{ID: 3, Title: "Signal Bloom", Category: "Abstract", Author: "Studio Halo", Year: 2088, Accent: "#b66bff",
		Description: "Абстракция из радиочастот: спектр ночного города, разложенный в цветковые спирали."},
	{ID: 4, Title: "Ghost Portrait", Category: "Portrait", Author: "I. Varga", Year: 2085, Accent: "#ff3ea5",
		Description: "Портрет курьера дата-рига. Контурный свет и следы сканирования сетчатки."},
	{ID: 5, Title: "Midnight Elevator", Category: "Night", Author: "K. Aoki", Year: 2087, Accent: "#7c5cff",
		Description: "Стеклянный лифт внутри башни Оникума: город дышит где-то за тонированным стеклом."},
	{ID: 6, Title: "Neon Koi", Category: "Neon", Author: "Studio Halo", Year: 2089, Accent: "#ff5edb",
		Description: "Световые карпы в канале Старого района — рекламный рой, обученный держаться стаей."},
	{ID: 7, Title: "Skyline Drift", Category: "City", Author: "M. Oduya", Year: 2088, Accent: "#38f5c8",
		Description: "Гравитационный транспорт над деловым сектором. Слои подсветки создают эффект глубины слоя."},
	{ID: 8, Title: "Silicon Veil", Category: "Portrait", Author: "I. Varga", Year: 2089, Accent: "#22e6ff",
		Description: "Лицо, закрытое полупрозрачной сенсорной вуалью. Единственный источник света — сам кадр."},
	{ID: 9, Title: "Voltage Bloom", Category: "Abstract", Author: "R. Ferreira", Year: 2086, Accent: "#ff9a3c",
		Description: "Разряд трансформаторной подстанции, снятый на высокоскоростную камеру и пересобранный в вазу."},
	{ID: 10, Title: "Blue Hour Rail", Category: "Night", Author: "K. Aoki", Year: 2085, Accent: "#4f8cff",
		Description: "Платформа монорельса в синий час. Пустая станция и одна полоса холодного света."},
	{ID: 11, Title: "Arcology Rain", Category: "City", Author: "V. Kestrel", Year: 2089, Accent: "#b66bff",
		Description: "Вертикальный город под ливнем: ярусы, мосты и свет, который не выключается никогда."},
	{ID: 12, Title: "Pink Static", Category: "Neon", Author: "R. Ferreira", Year: 2088, Accent: "#ff3ea5",
		Description: "Разлом рекламного щита: маджента утекает в помехи и собирает из шума новую форму."},
	{ID: 13, Title: "Aurora Protocol", Category: "Night", Author: "Studio Halo", Year: 2090, Accent: "#38f5c8",
		Description: "Орбитальный маяк раскладывает над сектором 9 искусственное сияние по протоколу сна."},
	{ID: 14, Title: "Fracture Study", Category: "Abstract", Author: "M. Oduya", Year: 2087, Accent: "#7c5cff",
		Description: "Серия о разрушении стекла под ультразвуком: трещины растут как корни ночного дерева."},
	{ID: 15, Title: "Wet Asphalt Gospel", Category: "Night", Author: "V. Kestrel", Year: 2086, Accent: "#22e6ff",
		Description: "Ночная улица после дождя: вывески дублируются в лужах и спорят за право быть оригиналом."},
	{ID: 16, Title: "Operator Eyes", Category: "Portrait", Author: "Studio Halo", Year: 2090, Accent: "#ff5edb",
		Description: "Оператор геокупола. В зрачках отражаются шесть экранов и одна настоящая звезда."},
}

// All returns a copy of the full dataset sorted by id.
func All() []Item {
	out := make([]Item, len(items))
	copy(out, items)
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// Filter returns the dataset narrowed by category and by a case-insensitive
// substring match over title, author, category and description. An empty
// category (or "all") keeps every item.
func Filter(category, q string) []Item {
	out := make([]Item, 0, len(items))
	cat := strings.ToLower(strings.TrimSpace(category))
	needle := strings.ToLower(strings.TrimSpace(q))

	for _, it := range All() {
		if cat != "" && cat != "all" && strings.ToLower(it.Category) != cat {
			continue
		}
		if needle != "" && !matches(it, needle) {
			continue
		}
		out = append(out, it)
	}
	return out
}

func matches(it Item, needle string) bool {
	for _, field := range []string{it.Title, it.Author, it.Category, it.Description} {
		if strings.Contains(strings.ToLower(field), needle) {
			return true
		}
	}
	return false
}

// BuildResponse assembles the API payload for the given filter and fills in
// the asset paths the frontend needs.
func BuildResponse(category, q string) Response {
	filtered := Filter(category, q)
	for i := range filtered {
		filtered[i].Image = fmt.Sprintf("/assets/poster-%02d.svg", filtered[i].ID)
		filtered[i].Width = ImageWidth
		filtered[i].Height = ImageHeight
	}
	return Response{
		Items:      filtered,
		Categories: Categories,
		Total:      len(All()),
		Count:      len(filtered),
		Query:      strings.TrimSpace(q),
		Category:   strings.TrimSpace(category),
	}
}
