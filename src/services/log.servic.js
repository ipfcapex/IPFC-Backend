// services/logService.js
const {
    User,
    Warehouse,
    Announcement,
    Customer,
    Factory,
    Production,
    Product,
    Schemes,
    Stock,
    SellOrder,
    Token
} = require("../models");

const QRCODE = require("../models/qrCode.model");

// At the top of your file
const formatDateToIST = (date) => {
    if (!date) return "N/A";
    const d = new Date(date);
    const options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata' // IST
    };
    return d.toLocaleString('en-IN', options).replace(',', ' ~');
};

// Resolve the product name (article) and category name from a populated
// productId (Product doc with its category subdocs) and a categoryId.
const resolveArticleAndCategory = (product, categoryId) => {
    const article = product?.article || "Unknown Article";
    const matched = Array.isArray(product?.category)
        ? product.category.find((c) => String(c._id) === String(categoryId))
        : null;
    const category = matched?.categoryCode || "Unknown Category";
    return { article, category };
};

exports.getRecentUpdates = async (page, limit, search = "", from = null, to = null) => {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setDate(twentyFourHoursAgo.getDate() - 30);

    // fetch users
    const users = await User.find({
        updatedAt: {
            $gte: twentyFourHoursAgo,
        },
    }).select("name role createdAt updatedAt");

    // fetch warehouses
    const warehouses = await Warehouse.find({
        updatedAt: {
            $gte: twentyFourHoursAgo,
        },
    }).select("name createdAt updatedAt");

    // fetch annoucenment
    const annoucenment = await Announcement.find({
        updatedAt: {
            $gte: twentyFourHoursAgo,
        },
    }).select("title createdAt updatedAt");

    // fetch customer
    const customer = await Customer.find({
        updatedAt: {
            $gte: twentyFourHoursAgo,
        },
    }).select("name createdAt updatedAt");

    // fetch factory
    const factory = await Factory.find({
        updatedAt: {
            $gte: twentyFourHoursAgo,
        },
    }).select("name createdAt updatedAt");

    //fetch production
    const production = await Production.find({
        updatedAt: {
            $gte: twentyFourHoursAgo,
        },
    })
        .populate("factory", "name")
        .populate("productId", "article category")
        .select(
            "factory productId categoryId productionNo productionQuantity createdAt updatedAt status dispatchedQuantity"
        );

    // fetch QRcode
    const qrcode = await QRCODE.find({
        updatedAt: {
            $gte: twentyFourHoursAgo,
        },
    })
        .populate("qrCodes.productId", "article category")
        .select("productionNo qrCodes createdAt updatedAt");

    // fetch Product
    const product = await Product.find({
        updatedAt: {
            $gte: twentyFourHoursAgo,
        },
    }).select("article articleCode createdAt updatedAt");

    // fetch Schemes
    const schemes = await Schemes.find({
        updatedAt: {
            $gte: twentyFourHoursAgo,
        },
    }).select(
        "schemesName schemesDescription schemesType schemesQuantity createdAt updatedAt"
    );

    // Order Stock
    const stock = await Stock.find({
        updatedAt: { $gte: twentyFourHoursAgo },
    })
        .populate("warehouse", "name") // populate warehouse name
        .populate("stockdata.productId", "article category") // populate product name + category
        .select(
            "warehouse toatalQuantity dispatchStock stockdata createdAt updatedAt"
        );

    // fetch Stock
    const order = await SellOrder.find({
        updatedAt: { $gte: twentyFourHoursAgo },
    })
        .populate("customer items.warehouses.warehouse", "name") // populate warehouse name
        .select(
            "salesOrderNo customer items WishList accountSectionApproval inventoryManagerApproval ScannedByWarehouseManager deliveryStatus createdAt updatedAt"
        );

    // fetch Token
    const tokens = await Token.find({
        $or: [
            { createdAt: { $gte: twentyFourHoursAgo } }, 
            { updatedAt: { $gte: twentyFourHoursAgo } }, 
        ]
    })
        .populate("user", "name role fullAddress")
        .select(
    "user createdAt updatedAt fullAddress city area latitude longitude type"
);

    const formattedUsers = users.map((user) => {
        const isNew = user.createdAt.getTime() === user.updatedAt.getTime();
        return {
            type: "User",
            name: `${user.name} (${user.role})`,
            date: user.updatedAt,
            Action: isNew
                ? `New User Created name ${user.name} and role is ${user.role}`
                : `User Updated name ${user.name} and role is ${user.role}`,
        };
    });

    const formattedWarehouses = warehouses.map((wh) => {
        const isNew = wh.createdAt.getTime() === wh.updatedAt.getTime();
        return {
            type: "Warehouse",
            name: wh.name, // ✅ keep name
            date: wh.updatedAt, // raw date for sorting
            Action: isNew
                ? `New Warehouse Created name ${wh.name}`
                : `Warehouse Detail Updated for ${wh.name}`,
        };
    });

    const formattedAnnoucenment = annoucenment.map((an) => {
        const isNew = an.createdAt.getTime() === an.updatedAt.getTime();
        return {
            type: "Annoucement",
            name: an.title,
            date: an.updatedAt,
            Action: isNew
                ? `New Annoucenment Created name ${an.title}`
                : `Annoucenment Detail Updated for ${an.title}`,
        };
    });

    const formattedCustomer = customer.map((cs) => {
        const isNew = cs.createdAt.getTime() === cs.updatedAt.getTime();
        return {
            type: "Customer",
            name: cs.name,
            date: cs.updatedAt,
            Action: isNew
                ? `New Customer ${cs.name} have joined Apex`
                : `Customer Detail Updated for ${cs.name}`,
        };
    });

    const formattedFactory = factory.map((fs) => {
        const isNew = fs.createdAt.getTime() === fs.updatedAt.getTime();
        return {
            type: "Factory",
            name: fs.name,
            date: fs.updatedAt,
            Action: isNew
                ? `New Production House ${fs.name} has been created`
                : `Details of Production House ${fs.name} have been updated`,
        };
    });

    const formattedProduction = production.map((pd) => {
        const factoryName = pd.factory?.name || "Unknown Factory";
        const { article, category: categoryName } = resolveArticleAndCategory(
            pd.productId,
            pd.categoryId
        );
        const isNew = pd.createdAt.getTime() === pd.updatedAt.getTime();
        let actionMessage = "";

        if (isNew && pd.status === "Ready") {
            actionMessage = `At ${factoryName}, new production is done for article: ${article} (category: ${categoryName}) with quantity: ${pd.productionQuantity}`;
        } else if (pd.status === "Partially Dispatch") {
            actionMessage = `For production number ${pd.productionNo}, QR has been scanned. ${pd.dispatchedQuantity} out of ${pd.productionQuantity} units have been dispatched.`;
        } else if (pd.status === "Dispatch from Factory") {
            actionMessage = `Qr-scanned for ProductionNo: ${pd.productionNo} and Dispatch from ${factoryName} for article: ${article} (category: ${categoryName})`;
        } else {
            actionMessage = `Details updated for production ${pd.productionNo} at ${factoryName}`;
        }

        return {
            type: "Production",
            name: `${factoryName}`,
            article: article,
            category: categoryName,
            quantity: pd.productionQuantity,
            date: pd.updatedAt,
            Action: actionMessage,
        };
    });

    const formattedqrcode = qrcode.map((cs) => {
        const firstEntry = cs.qrCodes?.[0];
        const { article, category } = resolveArticleAndCategory(
            firstEntry?.productId,
            firstEntry?.categoryId
        );
        const isNew = cs.createdAt.getTime() === cs.updatedAt.getTime();
        return {
            type: "QR-Code",
            name: `Article: ${article} (${category})`,
            date: cs.updatedAt,
            Action: isNew
                ? `Qr Created for productionNo: ${cs.productionNo}, article: ${article} (category: ${category})`
                : `Qr-Detail Updated for ${cs.productionNo}, article: ${article} (category: ${category})`,
        };
    });

    const formattedProduct = product.map((pd) => {
        const Article = pd.article;
        const isNew = pd.createdAt.getTime() === pd.updatedAt.getTime();
        let actionMessage = "";

        if (isNew && Article) {
            actionMessage = `New Article is created ${Article}`;
        } else if (pd.articleCode) {
            actionMessage = `For Article: ${Article} articlecode: ${pd.articleCode} is created`;
        } else {
            actionMessage = `Product Detail Updated  ${Article}`;
        }

        return {
            type: "Article-Detail",
            name: `${Article}`,
            date: pd.updatedAt,
            Action: actionMessage,
        };
    });

    const formattedschemes = schemes.map((cs) => {
        const isNew = cs.createdAt.getTime() === cs.updatedAt.getTime();
        return {
            type: "Schemes",
            name: cs.schemesName,
            date: cs.updatedAt,
            Action: isNew
                ? `${cs.schemesDescription}`
                : `Schemes Updated: ${cs.schemesDescription}`,
        };
    });

    const formattedstock = stock.map((pd) => {
        const warehouseName = pd.warehouse?.name || "Unknown Warehouse";

        // Extract stockdata
        const stockDetails =
            pd.stockdata?.map((item) => {
                const { article, category } = resolveArticleAndCategory(
                    item.productId,
                    item.categoryId
                );
                return {
                    productionNo: item.productionNo,
                    article,
                    category,
                };
            }) || [];

        // Take only the first productionNo (if exists)
        const ProductionNo =
            stockDetails.length > 0 ? stockDetails[0].productionNo : null;
        const article = stockDetails.length > 0 ? stockDetails[0].article : null;
        const category = stockDetails.length > 0 ? stockDetails[0].category : null;

        const isNew = pd.createdAt.getTime() === pd.updatedAt.getTime();
        let actionMessage = "";

        if (isNew && pd.toatalQuantity) {
            actionMessage = `Stock arrived at warehouse ${warehouseName}, Detail: ProductionNo-${ProductionNo}, Article-${article} (category: ${category}), Quantity-${pd.toatalQuantity}`;
        } else if (pd.dispatchStock != 0) {
            actionMessage = `Detail: ProductionNo-${ProductionNo}, Article-${article} (category: ${category}), Quantity-${pd.dispatchStock} out of Total-Quantity-${pd.toatalQuantity} has been dispatched from warehouse ${warehouseName}`;
        } else {
            actionMessage = `Stock updated in warehouse ${warehouseName}, Detial: article: ${article} (category: ${category}), total: ${pd.toatalQuantity}`;
        }

        return {
            type: "Warehouse-Stock",
            name: warehouseName,
            date: pd.updatedAt,
            Action: actionMessage,
            stockdata: stockDetails,
        };
    });

    const formattedOrder = order.map((pd) => {
        const CustomerName = pd.customer?.name || "Unknown Customer";
        const isNew = pd.createdAt.getTime() === pd.updatedAt.getTime();
        let actionMessage = "";

        const items = pd.items?.map((item) => ({
            article: item.article,
            quantity: item.quantity,
             warehouses: Array.isArray(item.warehouses) ? item.warehouses : [],
        })) || [];

        const wishlist = pd.WishList?.map((item) => ({
            article: item.article,
            quantity: item.quantity,
        })) || [];

        const hasItems = items.length > 0;
        const hasWishlist = pd.WishList && pd.WishList.length > 0;
        const articleList = items.map((i) => i.article).join(", ");
         const quantityList = items.map((i) => i.quantity).join(", ");
        const wishlistarticleList = wishlist.map((i) => i.article).join(", ");
         const scannedLogs = [];
      items.forEach((item) => {
    item.warehouses.forEach((wh) => {
      if (wh?.ScanByorder?.toUpperCase() === "SCANNED" && wh?.deliveryStatus?.toUpperCase() !== "DELIVERED") {
        const warehouseName = wh.warehouse?.name || wh.warehouse || "Unknown Warehouse";
        scannedLogs.push(
          `Article ${item.article} (Qty: ${wh.quantity}) was SCANNED in Warehouse ${warehouseName}`
        );
      }
    });
  });

  const scannedMessage = scannedLogs.length > 0 ? scannedLogs.join(" | ") : "";
        
        if (isNew && hasItems && hasWishlist) {
            actionMessage = `Order Created with Sales-orderNo ${pd.salesOrderNo}, articles [${articleList}], also some items are in wishlist due to low stock article ${wishlistarticleList}.`;
        } else if (isNew && hasItems) {
            const articleList = items.map((i) => i.article).join(", ");
            actionMessage = `Order Created with Sales-orderNo ${pd.salesOrderNo}, articles [${articleList}].`;
        } else if (!hasItems && hasWishlist) {
            actionMessage = `Order Created with Sales-orderNo ${pd.salesOrderNo}, but all items moved to wishlist due to low stock with article ${wishlistarticleList}.`;
        } else if (pd.deliveryStatus?.toUpperCase()=== "DELIVERED") {
            actionMessage = `Order ${pd.salesOrderNo} has been Delivered. ${scannedMessage}`;
        } else if (scannedLogs.length > 0) {
            actionMessage = `Order ${pd.salesOrderNo} has scanned items. ${scannedMessage}`;
        } else if (pd.inventoryManagerApproval === "APPROVED" && pd.accountSectionApproval === "APPROVED") {
            actionMessage = `Inventory Manager Approval: ${pd.inventoryManagerApproval} for Sales-orderNo ${pd.salesOrderNo}.`;
        } else if (pd.accountSectionApproval ) {
            actionMessage = `Account Section Approval: ${pd.accountSectionApproval} for Sales-orderNo ${pd.salesOrderNo}.`;
        } else {
            actionMessage = `Order ${pd.salesOrderNo} was updated.`;
        }

        return {
            type: "Order",
            name: `${CustomerName}-${pd.salesOrderNo}`,
            date: pd.updatedAt,
            Action: actionMessage,
        };
    });

    const formattedToken = users.map((u) => {
    // Auto logout times in UTC (converted from IST: 09:00, 12:00, 15:00, 18:00 IST → 03:30, 06:30, 09:30, 12:30 UTC)
    const autoLogoutTimesUTC = ["03:30", "06:30", "09:30", "12:30"];

    // Find the latest token for the user
    const t = tokens
        .filter(tok => tok.user?._id.toString() === u._id.toString())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]; // latest token

    let actionMessage = "";
    let date = new Date();
    let addressInfo = t?.fullAddress;

    if (t) {
        // Token exists → logged in
        date = t.createdAt; // use token creation time
        actionMessage = `User ${u.name} logged in at ${formatDateToIST(date)} from ${addressInfo}.`;
        
    } else {
        // No token today → nearest past auto logout time
        const now = new Date();
        let logoutTimeFound = false;

        for (let i = autoLogoutTimesUTC.length - 1; i >= 0; i--) {
            const [hours, minutes] = autoLogoutTimesUTC[i].split(":");
            const logoutDate = new Date(Date.UTC(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                Number(hours),
                Number(minutes)
            ));

            if (logoutDate <= now) {
                date = logoutDate;
                logoutTimeFound = true;
                break;
            }
        }

        if (!logoutTimeFound) {
            const [hours, minutes] = autoLogoutTimesUTC[0].split(":");
            date = new Date(Date.UTC(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                Number(hours),
                Number(minutes)
            ));
        }

        actionMessage = `User ${u.name} has not logged in today or has already logged out.`;
    }

    return {
        type: "User",
        name: `${u.name} (${u.role})`,
        date, 
        Action: actionMessage
    };
});

    // merge + sort + cleanup
    const merged = [
        ...formattedUsers,
        ...formattedWarehouses,
        ...formattedAnnoucenment,
        ...formattedCustomer,
        ...formattedFactory,
        ...formattedProduction,
        ...formattedqrcode,
        ...formattedProduct,
        ...formattedschemes,
        ...formattedstock,
        ...formattedOrder,
        ...formattedToken
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    let filtered = merged;

    if (search && search.trim() !== "") {
        const regex = new RegExp(search.trim(), "i"); // case-insensitive regex

        filtered = filtered.filter(item => {
            const nameMatch = item.name ? regex.test(item.name) : false;
            const actionMatch = item.Action ? regex.test(item.Action) : false;
            const typeMatch = item.type ? regex.test(item.type) : false;

            return nameMatch || actionMatch || typeMatch;
        });
    }

    // Filter by date range
    if (from || to) {
        const fromDate = from ? new Date(from) : new Date();
        const toDate = to ? new Date(to) : new Date();
        merged = merged.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= fromDate && itemDate <= toDate;
        });
    }

    const total = filtered.length;
    const pages = Math.ceil(total / limit);

    // calculate start and end indexes for pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    // slice only for the current page and format date
    const paginatedData = filtered.slice(startIndex, endIndex).map(item => ({
        updatedAt: formatDateToIST(item.date),
        type: item.type,
        name: item.name,
        Action: item.Action
    }));

    // send response
    return {
        data: paginatedData,
        itemsOnCurrentPage: paginatedData.length,
        total,
        page,
        limit,
        pages
    };
}
