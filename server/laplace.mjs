function field(event, names, fallback = undefined) {
  const sources = [
    event,
    event?.data,
    event?.payload,
    event?.user,
    event?.data?.user,
    event?.payload?.user,
    event?.gift,
    event?.data?.gift,
  ].filter(Boolean);
  for (const source of sources) {
    for (const name of names) {
      if (source[name] !== undefined && source[name] !== null) return source[name];
    }
  }
  return fallback;
}

export function normalizeLaplaceEvent(event) {
  const rawType = String(field(event, ["type", "cmd", "event"], "")).toLowerCase();
  const type = rawType.includes("super") || rawType.includes("sc")
    ? "superchat"
    : rawType.includes("gift")
      ? "gift"
      : rawType.includes("message") || rawType.includes("danmu")
        ? "message"
        : rawType;

  const uid = String(field(event, ["uid", "userId", "user_id", "senderUid"], ""));
  const username = String(
    field(event, ["username", "uname", "nickname", "userName"], "Unknown viewer"),
  );
  const message = String(field(event, ["message", "text", "content", "msg"], ""));
  const normalizedPrice = field(event, ["priceNormalized", "price_normalized"]);
  const explicitPrice = field(event, ["price", "value", "amount"]);
  const totalCoin = field(event, ["totalCoin", "total_coin"]);
  const giftId = field(event, ["giftId", "gift_id"]);
  const giftAmount = Number(field(event, ["giftAmount", "gift_amount", "num"], 1));
  const coinType = String(field(event, ["coinType", "coin_type"], "")).toLowerCase();

  // LAPLACE gift events expose the RMB value as priceNormalized. Their price
  // field is the discounted total in Bilibili coin units (1000 gold coins =
  // RMB 1), while Super Chat price is already expressed in RMB. Keep the old
  // direct-price behavior only for legacy gift payloads that have no LAPLACE
  // gift metadata.
  let price = 0;
  if (type === "gift" && coinType === "silver") {
    price = 0;
  } else if (normalizedPrice !== undefined) {
    price = Number(normalizedPrice);
  } else if (totalCoin !== undefined) {
    price = Number(totalCoin) / 1000;
  } else if (
    type === "gift" &&
    explicitPrice !== undefined &&
    (coinType === "gold" || giftId !== undefined)
  ) {
    price = Number(explicitPrice) / 1000;
  } else if (explicitPrice !== undefined) {
    price = Number(explicitPrice);
  }
  const giftName = String(field(event, ["giftName", "gift_name", "name"], "Gift"));
  const eventId = String(
    field(event, ["id", "eventId", "event_id", "transactionId", "tid"], ""),
  );
  const roomId = String(field(event, ["origin", "roomId", "room_id"], ""));
  const comboEnd = field(event, ["comboEnd", "combo_end", "repeatEnd", "repeat_end"], true);

  return {
    type,
    uid,
    username,
    message,
    price: Number.isFinite(price) ? price : 0,
    giftName,
    giftId: giftId === undefined ? "" : String(giftId),
    giftAmount: Number.isFinite(giftAmount) && giftAmount > 0 ? giftAmount : 1,
    coinType,
    eventId,
    roomId,
    comboEnd: comboEnd !== false && comboEnd !== 0,
    raw: event,
  };
}
