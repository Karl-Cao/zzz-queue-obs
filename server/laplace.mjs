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
  const blindGift = field(event, ['blindGift','blind_gift']);
  let valuationMissing = false;
  let valuationSource = null;
  let price = 0;
  if (type === "gift" && coinType === "silver") {
    price = 0;
  } else if (type === 'gift' && blindGift && typeof blindGift === 'object') {
    // Upstream SEND_GIFT_BLIND_GIFT: gift_tip_price is the reward's UNIT
    // value in gold coins; original_gift_price is only the box purchase price.
    const tip = blindGift.gift_tip_price;
    const unit = tip === undefined || tip === null || tip === '' ? NaN : Number(tip);
    if (Number.isFinite(unit) && unit >= 0 && Number.isInteger(giftAmount) && giftAmount > 0) {
      price = unit * giftAmount / 1000;
      valuationSource = 'reward';
    } else {
      const valid=value=>value!==undefined&&value!==null&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0;
      // Prefer actual total paid when present; original_gift_price is per box.
      if(valid(normalizedPrice)) price=Number(normalizedPrice);
      else if(valid(totalCoin)) price=Number(totalCoin)/1000;
      else if(valid(explicitPrice)) price=Number(explicitPrice)/1000;
      else if(valid(blindGift.original_gift_price)&&Number.isInteger(giftAmount)&&giftAmount>0) price=Number(blindGift.original_gift_price)*giftAmount/1000;
      else valuationMissing=true;
      if(!valuationMissing)valuationSource='purchase';
    }
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

  const guard = field(event, ['guardType','guard_level','guardLevel']);
  const guardType = guard !== undefined && [0,1,2,3].includes(Number(guard)) ? Number(guard) : undefined;
  return {
    valuationSource,
    valuationMissing,
    guardType,
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
