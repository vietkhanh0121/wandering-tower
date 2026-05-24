import { debugCreateOverlapTowerPair, debugCreateTowerStack } from "../game/rules";

const DEBUG_OVERLAP_PAIRS = [
  [9, 11],
  [5, 3],
  [6, 2],
  [8, 0]
];

export function DebugBar({
  game,
  setGame,
  captureState,
  debugShowTowers,
  setDebugShowTowers,
  debugShowWizards,
  setDebugShowWizards,
  debugShowTowerNames,
  setDebugShowTowerNames,
  debugShowWizardNames,
  setDebugShowWizardNames,
  debugShowTileNames,
  setDebugShowTileNames,
  debugShowTowerPaths,
  setDebugShowTowerPaths,
  debugShowSlotMachine,
  setDebugShowSlotMachine,
  debugShowPotionMinigame,
  setDebugShowPotionMinigame,
  debugShowWinBanner,
  setDebugShowWinBanner,
  debugShowLoseBanner,
  setDebugShowLoseBanner,
  setExpandedStackIndex,
  forbiddenSpells,
  spellbooks,
  handPlayerId
}) {
  function setForbiddenCard(spell) {
    if (!spell) return;
    setGame((current) => {
      const next = structuredClone(current);
      const currentForbidden = next.forbidden.filter((item) => item.id !== spell.id);
      next.forbidden = [spell, ...currentForbidden].slice(0, 3);
      next.forbiddenPool = forbiddenSpells.filter((item) => !next.forbidden.some((active) => active.id === item.id));
      next.message = `Debug: đưa Bí thuật #${forbiddenSpells.findIndex((item) => item.id === spell.id) + 1} vào bàn.`;
      next.log.unshift(next.message);
      return next;
    });
  }

  function showDiceBookInHand() {
    setGame((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const player = next.players.find((item) => item.id === handPlayerId) ?? next.players.find((item) => item.id === next.turnOrder[next.currentPlayerIndex]) ?? next.players[0];
      const diceBookSource = [
        ...next.deck,
        ...(spellbooks ?? []),
        ...next.players.flatMap((item) => item.hand)
      ].find((spell) => spell.pages?.some((page) => page.diceRolls));

      if (!player || !diceBookSource) return current;

      const diceBook = structuredClone(diceBookSource);
      const replaced = player.hand[0]?.id === diceBook.id ? null : player.hand[0] ?? null;
      const remainingHand = player.hand.filter((spell) => spell.id !== diceBook.id && spell.id !== replaced?.id);
      player.hand = [diceBook, ...remainingHand.slice(0, 2)];
      next.deck = next.deck.filter((spell) => spell.id !== diceBook.id);
      if (replaced && replaced.id !== diceBook.id) next.deck.unshift(replaced);
      next.message = `Debug: đưa ${diceBook.name} có xúc xắc vào Hand của ${player.name}.`;
      next.log.unshift(next.message);
      return next;
    });
  }

  return (
    <section className="debugBar">
      <div className="debugMessage">
        <span>Message</span>
        <b>{game.message}</b>
      </div>
      <div className="debugGroup">
        <span>Bí thuật</span>
        <div className="debugGrid debugForbiddenGrid">
          {Array.from({ length: 16 }).map((_, index) => {
            const spell = forbiddenSpells[index] ?? null;
            const isActive = spell && game.forbidden.some((item) => item.id === spell.id);
            return (
              <button
                key={index}
                className={isActive ? "active" : ""}
                disabled={!spell}
                title={spell?.effect ?? "Chưa có dữ liệu"}
                onClick={() => setForbiddenCard(spell)}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </div>
      <div className="debugGroup">
        <span>Stack</span>
        <div className="debugGrid">
          {[2, 3, 4, 5, 6, 7, 8].map((size) => (
            <button key={size} onClick={() => { captureState(); setGame(debugCreateTowerStack(game, size)); }}>
              {size}
            </button>
          ))}
        </div>
      </div>
      <div className="debugGroup">
        <span>Pair</span>
        <div className="debugGrid debugPairGrid">
          {DEBUG_OVERLAP_PAIRS.map(([front, back], index) => (
            <button key={`${front}-${back}`} title={`T${front}/${back}`} onClick={() => {
              captureState();
              setGame(debugCreateOverlapTowerPair(game, front, back));
              setExpandedStackIndex(null);
            }}>
              {index + 1}
            </button>
          ))}
        </div>
      </div>
      <button
        className={debugShowTowers ? "active" : ""}
        onClick={() => {
          setDebugShowTowers((current) => !current);
          setExpandedStackIndex(null);
        }}
      >
        {debugShowTowers ? "Hide T" : "Show T"}
      </button>
      <button
        className={debugShowWizards ? "active" : ""}
        onClick={() => setDebugShowWizards((current) => !current)}
      >
        {debugShowWizards ? "Hide W" : "Show W"}
      </button>
      <button
        className={debugShowTowerNames ? "active" : ""}
        onClick={() => setDebugShowTowerNames((current) => !current)}
      >
        {debugShowTowerNames ? "Hide Tower Name" : "Show Tower Name"}
      </button>
      <button
        className={debugShowWizardNames ? "active" : ""}
        onClick={() => setDebugShowWizardNames((current) => !current)}
      >
        {debugShowWizardNames ? "Hide Wizard Name" : "Show Wizard Name"}
      </button>
      <button
        className={debugShowTileNames ? "active" : ""}
        onClick={() => setDebugShowTileNames((current) => !current)}
      >
        {debugShowTileNames ? "Hide Tile Name" : "Show Tile Name"}
      </button>
      <button
        className={debugShowTowerPaths ? "active" : ""}
        onClick={() => setDebugShowTowerPaths((current) => !current)}
      >
        {debugShowTowerPaths ? "Hide Path" : "Show Path"}
      </button>
      <button
        className={debugShowSlotMachine ? "active" : ""}
        onClick={() => setDebugShowSlotMachine((current) => !current)}
      >
        {debugShowSlotMachine ? "Hide Slot" : "Slot"}
      </button>
      <button
        className={debugShowPotionMinigame ? "active" : ""}
        onClick={() => setDebugShowPotionMinigame((current) => !current)}
      >
        {debugShowPotionMinigame ? "Hide Potion" : "Potion"}
      </button>
      <button
        className={debugShowWinBanner ? "active" : ""}
        onClick={() => setDebugShowWinBanner((current) => !current)}
      >
        {debugShowWinBanner ? "Hide Win" : "Win Banner"}
      </button>
      <button
        className={debugShowLoseBanner ? "active" : ""}
        onClick={() => setDebugShowLoseBanner((current) => !current)}
      >
        {debugShowLoseBanner ? "Hide Lose" : "Lose Banner"}
      </button>
      <button onClick={showDiceBookInHand}>Dice Book</button>
    </section>
  );
}
