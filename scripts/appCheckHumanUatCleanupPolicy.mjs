export const exactUatProjectId = "greek-yogert-customer-uat-2026";
export const productionProjectId = "greek-yogert";

export function timestampMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function isAutomatedUatRecord(id, value = {}) {
  return [id, value.customerName, value.customerNickname, value.customerNote]
    .filter((candidate) => typeof candidate === "string")
    .some(
      (candidate) =>
        candidate.startsWith("APP-CHECK-AUTO-") ||
        candidate.startsWith("WP4-AUTO-") ||
        candidate.startsWith("WP5-") ||
        candidate === "isolated browser UAT",
    );
}

export function validateExactHumanUatChain({
  requestId,
  request,
  orderId,
  order,
  submittedAfterMillis,
  itemIds,
  groupIds,
  itemDocuments,
  groupDocuments,
  designatedStaffUids,
  ownerIsAnonymous,
  ownerAuthorizationExists,
}) {
  const errors = [];
  const submittedAtMillis = timestampMillis(request?.submittedAt);
  if (!request || request.id !== requestId || request.retryId !== requestId)
    errors.push("request identity is not exact");
  if (isAutomatedUatRecord(requestId, request))
    errors.push("automated UAT records cannot use the Human-UAT cleanup path");
  if (
    submittedAtMillis === null ||
    !Number.isFinite(submittedAfterMillis) ||
    submittedAtMillis < submittedAfterMillis
  )
    errors.push("request is outside the approved Human-UAT time boundary");
  if (!order || request?.confirmedOrderId !== orderId || order.id !== orderId)
    errors.push("request-to-Order link is not exact");
  if (
    order &&
    (order.customerName !== request?.customerName ||
      order.queueNumber !== request?.queueNumber)
  )
    errors.push("request and Order business fields do not match");
  if (!Array.isArray(request?.itemIds) || !Array.isArray(request?.itemGroupIds))
    errors.push("request normalization references are missing");
  if (
    JSON.stringify([...(request?.itemIds ?? [])].sort()) !==
    JSON.stringify([...itemIds].sort())
  )
    errors.push("normalized item identifiers do not match");
  if (
    JSON.stringify([...(request?.itemGroupIds ?? [])].sort()) !==
    JSON.stringify([...groupIds].sort())
  )
    errors.push("normalized group identifiers do not match");
  if (
    !itemDocuments.every(
      (value) =>
        value.requestId === requestId && value.ownerUid === request?.ownerUid,
    ) ||
    !groupDocuments.every(
      (value) =>
        value.requestId === requestId && value.ownerUid === request?.ownerUid,
    )
  )
    errors.push("normalized child ownership is inconsistent");
  if (
    typeof request?.ownerUid !== "string" ||
    designatedStaffUids.includes(request.ownerUid) ||
    ownerAuthorizationExists
  )
    errors.push("owner identity is not an isolated anonymous Customer");
  if (ownerIsAnonymous !== true)
    errors.push("owner Authentication provider is not exactly anonymous");
  return { valid: errors.length === 0, errors, submittedAtMillis };
}
