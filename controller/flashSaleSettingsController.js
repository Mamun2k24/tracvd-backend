import FlashSaleSettings from "../model/flashSaleSetting.model.js";

// GET
export const getFlashSaleSettings = async (req, res) => {
  try {
    let settings = await FlashSaleSettings.findOne();

    if (!settings) {
      settings = await FlashSaleSettings.create({
        name: "Flash Sale",
        status: "active",
      });
    }

    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// UPDATE
export const updateFlashSaleSettings = async (req, res) => {
  try {
    const { name, startDate, endDate, status } = req.body;

    let settings = await FlashSaleSettings.findOne();

    if (!settings) {
      settings = await FlashSaleSettings.create({
        name,
        startDate,
        endDate,
        status,
      });
    } else {
      settings.name = name;
      settings.startDate = startDate;
      settings.endDate = endDate;
      settings.status = status;

      await settings.save();
    }

    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};