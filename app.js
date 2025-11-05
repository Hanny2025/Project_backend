const express = require("express");
const cors = require("cors"); // ✅ เพิ่มถ้ายังไม่มี
const pool = require("./db"); // ✅ ดึง pool จาก db.js
const bcrypt = require("bcrypt");

const app = express();
const port = 3000;
app.use(cors()); // ✅ ให้ Flutter เรียกได้
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from Express!");
});

// =========================
// ✅ Login API (ปลอดภัย)
// =========================
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log("Login attempt received:", { username });

    // 2. ค้นหา "username" อย่างเดียว
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [
      username,
    ]);

    // 3. ถ้าไม่เจอ username
    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid username" });
    }

    const user = rows[0];

    // 4. เปรียบเทียบรหัสผ่านที่ส่งมา กับ "hash" ใน DB
    const match = await bcrypt.compare(password, user.password);

    if (match) {
      // ✅ รหัสผ่านถูกต้อง
      delete user.password; // ลบ hash ออกจากข้อมูลที่จะส่งกลับ
      res.status(200).json({
        message: "Login successful!",
        user: user,
      });
    } else {
      // ❌ รหัสผ่านผิด
      res.status(401).json({ message: "Invalid  password" });
    }
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// ✅ Register API (ปลอดภัย)
// (อันนี้ที่คุณลืมเพิ่มในไฟล์ล่าสุด)
// =========================
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Missing username or password" });
    }

    // ตรวจว่ามีผู้ใช้นี้อยู่แล้วไหม
    const [existing] = await pool.query(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    // 5. สร้าง Hash จากรหัสผ่าน
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 6. บันทึก "hashedPassword" ลง DB
    await pool.query("INSERT INTO users (username, password) VALUES (?, ?)", [
      username,
      hashedPassword,
    ]);

    res.status(201).json({ message: "User registered successfully!" });
  } catch (error) {
    console.error("❌ Error during registration:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// ✅ Browse API (แสดงรายการห้องทั้งหมด)
// =========================
app.get("/browse", async (req, res) => {
  try {
    const [rooms] = await pool.query("SELECT * FROM room");
    res.json(rooms);
  } catch (error) {
    console.error("❌ Error fetching rooms:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// =============================================
// 🟢 API สำหรับการจอง (แก้ไข Logic ตรงนี้) 🟢
// =============================================
app.post("/bookrequest", async (req, res) => {
  try {
    const { room_id, user_id, time_column } = req.body;

    if (!room_id || !user_id || !time_column) {
      return res
        .status(400)
        .json({ message: "Missing room_id, user_id, or time_column" });
    }

    const [rows] = await pool.query("SELECT ?? FROM room WHERE Room_id = ?", [
      time_column,
      room_id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Room not found" });
    }

    const currentStatus = rows[0][time_column];
    if (currentStatus.toLowerCase() !== "free") {
      return res
        .status(409)
        .json({ message: `Slot is already ${currentStatus}` });
    }

    const timeMap = {
      Time_status_08: { start: "08:00:00", end: "10:00:00" },
      Time_status_10: { start: "10:00:00", end: "12:00:00" },
      Time_status_13: { start: "13:00:00", end: "15:00:00" },
      Time_status_15: { start: "15:00:00", end: "17:00:00" },
    };

    const selectedTime = timeMap[time_column];
    if (!selectedTime) {
      return res.status(400).json({ message: "Invalid time column" });
    }

    const today = new Date().toISOString().split("T")[0];
    const startTime = `${today} ${selectedTime.start}`;
    const endTime = `${today} ${selectedTime.end}`;

    await pool.query(
      `INSERT INTO bookings (start_time, end_time, status, user_id, room_id)
       VALUES (?, ?, ?, ?, ?)`,
      [startTime, endTime, "Pending...", user_id, room_id]
    );

    await pool.query("UPDATE room SET ?? = 'Pending...' WHERE Room_id = ?", [
      time_column,
      room_id,
    ]);

    res
      .status(201)
      .json({ message: "Booking successful! Status set to Pending..." });
  } catch (error) {
    console.error("❌ Error during booking:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/check", async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ message: "Missing user_id" });
    }

    const [rows] = await pool.query(
      `SELECT 
         b.Booking_id,
         b.Start_time AS start_time,
         b.End_time AS end_time,
         b.Status AS status,
         r.Room_name AS Room_name,
         r.Image_url AS image_url,
         DATE(b.Start_time) AS booking_date
       FROM bookings b
       JOIN room r ON b.Room_id = r.Room_id
       WHERE b.User_id = ?
       ORDER BY b.Start_time DESC`,
      [user_id]
    );

    res.json(rows);
  } catch (error) {
    console.error("❌ Error fetching user bookings:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// ✅ Start Server (ถูกต้องแล้ว)
// =========================
app.listen(port, "0.0.0.0", () => {
  console.log(`✅ Express server running at http://localhost:${port}`);
  console.log("Waiting for login/register requests...");
});
