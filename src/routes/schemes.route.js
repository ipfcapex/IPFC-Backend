const express = require('express')
const router = express.Router();
const { schemesController } = require('../controllers')

router.post('/create', schemesController.crtSchemes)
router.get('/', schemesController.getAll)
router.get('/:id', schemesController.getById)
router.put('/:id', schemesController.UpdateSchemsbyID)
router.delete('/delete/:id', schemesController.softdelete)

module.exports = router;