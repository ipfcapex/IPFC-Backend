const cron = require("node-cron");
const { Wishlist } = require("../models");
const wishlistService = require("./wishlist.service");

// Same 15h window. If a wishlist is neither
// Accepted nor Rejected within 15h of stock being applied (wishlistStockTime),
// it is archived to WishlistHistory as a "Timeout" instead of being silently
// deleted.
const TIMEOUT_MS = 15 * 60 * 60 * 1000;

// The wishlist collection used to carry a TTL index
// { wishlistStockTime: 1 }, { expireAfterSeconds: 43200 } that DELETED documents
// 12h after wishlistStockTime. We now archive timeouts to WishlistHistory
// instead, so that TTL index must be dropped -- otherwise MongoDB keeps deleting
// records before we can archive them. Mongoose does not drop removed indexes
// automatically, so we do it here, once, at startup.
let ttlIndexChecked = false;
const dropLegacyTtlIndex = async () => {
  if (ttlIndexChecked) return;
  try {
    const indexes = await Wishlist.collection.indexes();
    const ttl = indexes.find(
      (i) =>
        i.expireAfterSeconds !== undefined &&
        i.key &&
        i.key.wishlistStockTime === 1
    );
    if (ttl) {
      await Wishlist.collection.dropIndex(ttl.name);
      console.log(`Dropped legacy wishlist TTL index: ${ttl.name}`);
    }
    ttlIndexChecked = true;
  } catch (error) {
    // Collection may not exist yet / connection not ready; retry next run.
    console.error("Wishlist TTL index check failed:", error.message);
  }
};

const runWishlistTimeoutJob = async () => {
  try {
    await dropLegacyTtlIndex();

    const cutoff = new Date(Date.now() - TIMEOUT_MS);

    // Only pending wishlists live in this collection, so any with stock applied
    // more than 15h ago that are still here have timed out.
    const expired = await Wishlist.find({
      wishlistStockTime: { $ne: null, $lte: cutoff },
    });

    let archived = 0;
    for (const wishlist of expired) {
      try {
        await wishlistService.archiveWishlist(wishlist, "Timeout");
        archived += 1;
      } catch (err) {
        console.error(
          `Failed to archive timed-out wishlist ${wishlist._id}:`,
          err.message
        );
      }
    }

    if (archived > 0) {
      console.log(`Wishlist timeout job: ${archived} wishlist(s) archived as Timeout`);
    }
  } catch (error) {
    console.error("Wishlist timeout cron failed:", error.message);
  }
};

// Check every 10 minutes.
cron.schedule("*/10 * * * *", runWishlistTimeoutJob);

module.exports = { runWishlistTimeoutJob };
