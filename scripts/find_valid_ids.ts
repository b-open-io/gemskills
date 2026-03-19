#!/usr/bin/env bun
/**
 * Finds valid Met Museum object IDs with actual images for each search term
 */

const searches = [
  { style: "cubism", query: "cubism picasso" },
  { style: "surrealism", query: "surrealist dream" },
  { style: "art-nouveau", query: "art nouveau decorative" },
  { style: "art-deco", query: "art deco geometric" },
  { style: "pop-art", query: "pop art contemporary" },
  { style: "minimalism", query: "minimal abstract geometric" },
  { style: "gothic", query: "gothic medieval altarpiece" },
  { style: "dadaism", query: "dada collage" },
  { style: "futurism", query: "futurist speed motion" },
  { style: "constructivism", query: "constructivist geometric" },
  { style: "suprematism", query: "suprematist abstract" },
  { style: "de-stijl", query: "mondrian geometric" },
  { style: "abstract-expressionism", query: "abstract expressionist" },
  { style: "african-tribal", query: "african mask sculpture" },
  { style: "greek-classical", query: "greek statue marble" },
  { style: "nordic-viking", query: "viking norse" },
  { style: "polynesian", query: "polynesian oceanic" },
  { style: "ink-wash", query: "chinese ink landscape" },
  { style: "acrylic", query: "acrylic contemporary" },
  { style: "spray-paint", query: "graffiti street art" },
  { style: "screen-print", query: "silkscreen print" },
  { style: "collage", query: "collage paper" },
  { style: "stained-glass", query: "stained glass medieval" },
]

async function searchMet(query: string): Promise<number[]> {
  const url = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isPublicDomain=true&q=${encodeURIComponent(query)}`
  const res = await fetch(url)
  const data = await res.json()
  return data.objectIDs?.slice(0, 10) || []
}

async function getObject(id: number): Promise<{ title: string; img: string } | null> {
  const res = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`)
  const data = await res.json()
  if (data.primaryImageSmall) {
    return { title: data.title, img: data.primaryImageSmall }
  }
  return null
}

async function findValidId(style: string, query: string): Promise<void> {
  const ids = await searchMet(query)
  for (const id of ids) {
    const obj = await getObject(id)
    if (obj) {
      console.log(`${style}: ${id} - "${obj.title}"`)
      return
    }
  }
  console.log(`${style}: NO VALID ID FOUND`)
}

console.log("Finding valid Met Museum IDs...\n")

for (const { style, query } of searches) {
  await findValidId(style, query)
  await new Promise(r => setTimeout(r, 100)) // rate limit
}
