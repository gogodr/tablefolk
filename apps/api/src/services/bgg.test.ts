import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";

let searchBgg: typeof import("./bgg.js").searchBgg;
let getBggGame: typeof import("./bgg.js").getBggGame;

beforeAll(async () => {
  vi.stubEnv("BGG_TOKEN", "test-token");
  ({ searchBgg, getBggGame } = await import("./bgg.js"));
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("BGG import", () => {
  it("maps search candidates including expansions", async () => {
    const fetchMock = vi.fn(async () => new Response(`<items><item id="10" type="boardgame"><name type="primary" value="Forest Trail"/><yearpublished value="2023"/></item><item id="11" type="boardgameexpansion"><name type="primary" value="Forest Trail: More Trees"/></item></items>`));
    vi.stubGlobal("fetch", fetchMock);
    const games = await searchBgg("Forest Trail");
    expect(games).toEqual([
      { bggId: 10, kind: "boardgame", name: "Forest Trail", yearPublished: 2023 },
      { bggId: 11, kind: "boardgameexpansion", name: "Forest Trail: More Trees", yearPublished: null },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns each BGG ID once in search results", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`<items><item id="349286" type="boardgame"><name type="primary" value="First name"/></item><item id="349286" type="boardgame"><name type="alternate" value="Alternate name"/></item><item id="12" type="boardgameexpansion"><name type="primary" value="Expansion"/></item></items>`)));
    const games = await searchBgg("Duplicate example");
    expect(games.map((game) => game.bggId)).toEqual([349286, 12]);
    expect(games[0]?.name).toBe("First name");
  });

  it("reads stored player range and metadata from a game detail response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`<items><item id="11" type="boardgameexpansion"><name type="primary" value="Forest Trail: More Trees"/><minplayers value="2"/><maxplayers value="6"/><playingtime value="45"/><link type="boardgamedesigner" value="Alex Example"/><image>https://cf.geekdo-images.com/example.jpg</image></item></items>`)));
    const game = await getBggGame(11);
    expect(game).toMatchObject({ bggId: 11, kind: "boardgameexpansion", minPlayers: 2, maxPlayers: 6, playingTime: 45, designers: ["Alex Example"], imageUrl: "https://cf.geekdo-images.com/example.jpg" });
  });

  it("parses user collection XML with stats, ratings weight, and version", async () => {
    const { getBggCollection } = await import("./bgg.js");
    const mockCollectionXml = `
      <items totalitems="2">
        <item objectid="167791" subtype="boardgame">
          <name>Terraforming Mars</name>
          <yearpublished>2016</yearpublished>
          <stats minplayers="1" maxplayers="5" playingtime="120" minplaytime="90" maxplaytime="120">
            <rating>
              <averageweight value="3.24" />
            </rating>
          </stats>
          <version>
            <item id="316238" type="boardgameversion">
              <name>Maldito Games Spanish Edition</name>
            </item>
          </version>
        </item>
        <item objectid="133473" subtype="boardgame">
          <name>Sushi Go!</name>
          <yearpublished>2013</yearpublished>
          <stats minplayers="2" maxplayers="5" playingtime="20">
            <rating>
              <averageweight value="1.16" />
            </rating>
          </stats>
        </item>
      </items>
    `;

    vi.stubGlobal("fetch", vi.fn(async () => new Response(mockCollectionXml)));
    const collection = await getBggCollection("testuser");

    expect(collection).toHaveLength(2);
    expect(collection[0]).toEqual({
      bggId: 167791,
      kind: "boardgame",
      name: "Terraforming Mars",
      yearPublished: 2016,
      minPlayers: 1,
      maxPlayers: 5,
      playingTime: 120,
      minPlayingTime: 90,
      maxPlayingTime: 120,
      weight: 3.24,
      versionName: "Maldito Games Spanish Edition",
      imageUrl: null,
    });
    expect(collection[1]).toMatchObject({
      bggId: 133473,
      name: "Sushi Go!",
      weight: 1.16,
      playingTime: 20,
      versionName: null,
    });
  });

  it("fetches a batch of games via getBggGamesBatch", async () => {
    const { getBggGamesBatch } = await import("./bgg.js");
    const mockBatchXml = `
      <items totalitems="2">
        <item type="boardgame" id="101">
          <name type="primary" value="Catan" />
          <yearpublished value="1995" />
          <statistics page="1">
            <ratings>
              <averageweight value="2.31" />
            </ratings>
          </statistics>
        </item>
        <item type="boardgameexpansion" id="102">
          <name type="primary" value="Catan: Cities &amp; Knights" />
          <yearpublished value="1998" />
          <statistics page="1">
            <ratings>
              <averageweight value="3.15" />
            </ratings>
          </statistics>
        </item>
      </items>
    `;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(mockBatchXml)));
    const map = await getBggGamesBatch([101, 102]);
    expect(map.size).toBe(2);
    expect(map.get(101)?.name).toBe("Catan");
    expect(map.get(101)?.weight).toBe(2.31);
    expect(map.get(101)?.kind).toBe("boardgame");
    expect(map.get(102)?.name).toBe("Catan: Cities & Knights");
    expect(map.get(102)?.weight).toBe(3.15);
    expect(map.get(102)?.kind).toBe("boardgameexpansion");
  });

  it("reports upstream failure within the add flow", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    await expect(getBggGame(12)).rejects.toMatchObject({ code: "BGG_BUSY" });
  });
});
