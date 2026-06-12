const express = require('express');
const router = express.Router();
const { productController } = require('../controllers');
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization')
const upload = require('../middleware/csv.multer'); 
const imageuploads = require("../middleware/imageUpload.Middleware");

//add Article single at a time
router.post('/category',imageuploads.single("image"),requireAuth, requireAdminRoles('Admin', 'Administrator' ,'Sales Person','Packing Reporter','Inventory Manager'), productController.createProduct);

//add Article multipal at a time
router.post('/addArticle',imageuploads.array("image"),requireAuth, requireAdminRoles('Admin', 'Administrator' ,'Sales Person','Packing Reporter','Inventory Manager'), productController.createProductTypeTwoController);

//get all article
router.get('/',requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter','Inventory Manager'), productController.getProducts);

//get article by it category id 
router.get('/getone/:id',requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter','Inventory Manager'), productController.getProductByIds2);

//get a article in side its all catgory
router.get('/:id',requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter','Inventory Manager'), productController.getProductByIds);

//update article catgeory wise
router.put('/:id/update',imageuploads.single("image"),requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter','Inventory Manager'), productController.updateProduct);

//Delete aeticle category wise
router.delete('/:id/',requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter','Inventory Manager'), productController.deleteProduct);

// upload Article using csv 
router.post('/upload-csv', upload.single('file'), productController.uploadCSVController);

//Routes to add Article code(Note: this is current not in use) 
router.post('/addcode', productController.addArticleCodeToProduct);

//Add Article code for category wise 
router.post('/addcodebytype', productController.addArticleCodetoSub);

//currenty not in use
// router.put('/:id/articlecode', productController.updatearticlecode);

//update Artcile code by its catgeory
router.put('/category/:id', productController.updatearticlecode);

//csv file upload for article code 
router.post('/addcode/csv',upload.single('file'), productController.uploadarticlecodeCSVController);

//Delete hole article code(Note: this is current not in use)
router.delete('/deletecode/:id', requireAuth, requireAdminRoles('Administrator', 'Packing Reporter','Admin', 'Warehouse Manager'), productController.deleteArticleCodesss)

//Delete Articlecode for category
router.delete('/category/:id', requireAuth, requireAdminRoles('Administrator', 'Packing Reporter','Admin', 'Warehouse Manager'), productController.deleteArticleCode);

module.exports = router;
