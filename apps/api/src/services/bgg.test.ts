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

  it("reads stored player range and metadata from a game detail response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`<items><item id="11" type="boardgameexpansion"><name type="primary" value="Forest Trail: More Trees"/><minplayers value="2"/><maxplayers value="6"/><playingtime value="45"/><link type="boardgamedesigner" value="Alex Example"/><image>https://cf.geekdo-images.com/example.jpg</image></item></items>`)));
    const game = await getBggGame(11);
    expect(game).toMatchObject({ bggId: 11, kind: "boardgameexpansion", minPlayers: 2, maxPlayers: 6, playingTime: 45, designers: ["Alex Example"], imageUrl: "https://cf.geekdo-images.com/example.jpg" });
  });

  it("reports upstream failure within the add flow", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    await expect(getBggGame(12)).rejects.toMatchObject({ code: "BGG_BUSY" });
  });
});
