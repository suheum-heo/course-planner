import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/catalog", (_req, res) => {
  res.json([
    { id: "COMP_SCI_300", title: "Programming II", credits: 3 },
    { id: "COMP_SCI_400", title: "Programming III", credits: 3 }
  ]);
});

app.listen(3000, () => {
  console.log("Backend running on http://localhost:3000");
});
