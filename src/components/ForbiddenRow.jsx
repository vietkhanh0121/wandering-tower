import { useEffect, useRef, useState } from "react";

const FULL_EFFECT_BOLD_PHRASES = {
  "borrowed-shadow": ["1 pháp sư", "1 bước"],
  "midnight-step": ["Tháp Đen", "✡"],
  "sealed-stair": ["Giải phóng 1 pháp sư của mình", "pháp sư đối thủ"],
  "backward-step": ["1 pháp sư", "1 bước"],
  "keep-clockwise-step": ["Tháp Đen", "1 bước"],
  "top-tower-swap": ["2 đỉnh tháp"],
  "raven-tower-step": ["1 Tháp có ✡", "1 bước"]
};

export function ForbiddenRow({
  spells,
  allSpells,
  expandedForbiddenId,
  setExpandedForbiddenId,
  pendingForbidden,
  isBotTurn,
  localFullPotions,
  potionSprite,
  debugWizards,
  onUseForbidden,
  closingForbiddenId,
  cardRefs
}) {
  const previousSpellIdsRef = useRef(null);
  const [drawnForbiddenIds, setDrawnForbiddenIds] = useState(() => new Set());
  const spellIdsKey = spells.map((spell) => spell.id).join(",");

  useEffect(() => {
    const previous = previousSpellIdsRef.current;
    const currentIds = spells.map((spell) => spell.id);
    previousSpellIdsRef.current = new Set(currentIds);
    if (!previous) return;
    const nextDrawnIds = currentIds.filter((id) => !previous.has(id));
    if (!nextDrawnIds.length) return;
    setDrawnForbiddenIds((current) => new Set([...current, ...nextDrawnIds]));
    const timer = window.setTimeout(() => {
      setDrawnForbiddenIds((current) => {
        const next = new Set(current);
        nextDrawnIds.forEach((id) => next.delete(id));
        return next;
      });
    }, 460);
    return () => window.clearTimeout(timer);
  }, [spellIdsKey, spells]);

  return (
    <div className={expandedForbiddenId ? "forbiddenRow hasExpandedForbidden" : "forbiddenRow"}>
      {(spells.length ? spells : [null, null, null]).map((spell, slotIndex) => {
        const poolIndex = spell ? allSpells.findIndex((item) => item.id === spell.id) : -1;
        if (!spell) {
          return <div key={slotIndex} className={expandedForbiddenId ? "forbiddenCard forbiddenCardEmpty hidden" : "forbiddenCard forbiddenCardEmpty"} />;
        }

        const isExpanded = expandedForbiddenId === spell.id;
        const isHidden = expandedForbiddenId && !isExpanded;
        const canAfford = !isBotTurn && localFullPotions >= spell.potionCost;

        return (
          <div
            key={spell.id}
            ref={(element) => {
              if (!cardRefs) return;
              if (element) cardRefs.current.set(spell.id, element);
              else cardRefs.current.delete(spell.id);
            }}
            className={[
              "forbiddenCard",
              pendingForbidden?.spellId === spell.id ? "active" : "",
              isExpanded ? "expanded" : "",
              isHidden ? "hidden" : "",
              canAfford && !pendingForbidden ? "canAfford" : "",
              closingForbiddenId === spell.id ? "closing" : "",
              drawnForbiddenIds.has(spell.id) ? "drawn" : ""
            ].filter(Boolean).join(" ")}
            role="button"
            tabIndex={isHidden ? -1 : 0}
            aria-expanded={isExpanded}
            aria-label={spell.effect}
            onClick={() => {
              if (isHidden) return;
              setExpandedForbiddenId(isExpanded ? null : spell.id);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              if (isHidden) return;
              setExpandedForbiddenId(isExpanded ? null : spell.id);
            }}
          >
            <span className="forbiddenCost">
              <span>{spell.potionCost}x</span>
              <img src={potionSprite} alt="" />
            </span>
            {false && debugWizards && <span className="forbiddenDebugIndex">#{poolIndex + 1}</span>}
            <span className="forbiddenEffect" aria-hidden={isExpanded}>
              {renderForbiddenEffect(spell.shortEffect ?? spell.effect)}
            </span>
            <span className="forbiddenEffect forbiddenEffectFull" aria-hidden={!isExpanded}>
              {renderForbiddenEffect(spell.effect, FULL_EFFECT_BOLD_PHRASES[spell.id])}
            </span>
            <button
              className="forbiddenUseButton"
              type="button"
              disabled={isBotTurn || !isExpanded}
              tabIndex={isExpanded ? 0 : -1}
              aria-hidden={!isExpanded}
              onClick={(event) => {
                event.stopPropagation();
                onUseForbidden(spell);
              }}
            >
              Dùng
            </button>
          </div>
        );
      })}
    </div>
  );
}

function renderForbiddenEffect(text, boldPhrases = []) {
  if (!boldPhrases.length) return renderRavenIcons(text);
  const pattern = new RegExp(`(${boldPhrases.map(escapeRegExp).join("|")})`, "g");
  return text.split(pattern).filter(Boolean).flatMap((part, index) => {
    const content = renderRavenIcons(part);
    return boldPhrases.includes(part)
      ? <strong key={`${part}-${index}`}>{content}</strong>
      : content.map((item, itemIndex) => (
        typeof item === "string"
          ? item
          : <span key={`${index}-${itemIndex}`} className={item.props.className}>{item.props.children}</span>
      ));
  });
}

function renderRavenIcons(text) {
  return text.split("✡").flatMap((part, index, parts) => (
    index < parts.length - 1
      ? [part, <span key={index} className="forbiddenRavenIcon">✡</span>]
      : [part]
  ));
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
