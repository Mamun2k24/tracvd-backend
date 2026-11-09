import FlashSaleSettings from "../model/flashSaleSetting.model.js";

export const expireFlashSaleIfNeeded = async () => {
  const now = new Date();

  const settings = await FlashSaleSettings.findOne();

  if (!settings) {
    return {
      expired: false,
      settings: null,
    };
  }

  const endDate = settings.endDate
    ? new Date(settings.endDate)
    : null;

  const shouldExpire =
    settings.status === "active" &&
    endDate &&
    !Number.isNaN(endDate.getTime()) &&
    endDate <= now;

  if (!shouldExpire) {
    return {
      expired: false,
      settings,
    };
  }

  // শুধু campaign inactive হবে।
  // Product-এর toggle বা discount পরিবর্তন হবে না।
  settings.status = "inactive";

  await settings.save();

  return {
    expired: true,
    settings,
  };
};