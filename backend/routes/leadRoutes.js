const express = require("express");
const {
  createLeadController,
  listLeadsController,
  deleteLeadController
} = require("../controllers/leadController");

const router = express.Router();

router.get("/", listLeadsController);
router.post("/create", createLeadController);
router.delete("/:id", deleteLeadController);

module.exports = router;
