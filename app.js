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
app.get("/rooms-with-status", async (req, res) => {
  const date = req.query.date;
  if (!date) {
    return res.status(400).json({ message: "Missing 'date' query parameter" });
  }

  try {
    const sql = `
     SELECT 
        r.Room_id,
        r.Room_name,
        r.status AS Room_status, 
        ts.Slot_id,
        ts.Label AS Slot_label,
        COALESCE(rss.Status, 'Free') AS Slot_status
      FROM room r
      CROSS JOIN time_slots ts
      LEFT JOIN room_slot_status rss 
        ON r.Room_id = rss.Room_id 
        AND ts.Slot_id = rss.Slot_id 
        AND rss.Date = ?
      
      WHERE r.status IN ('Free', 'Pending')  
      ORDER BY r.Room_id, ts.Slot_id;
    `;

    const [rows] = await pool.query(sql, [date]);

    if (rows.length === 0) {
      return res.json([]);
    }

    const roomsMap = new Map();

    for (const row of rows) {
      if (!roomsMap.has(row.Room_id)) {
        roomsMap.set(row.Room_id, {
          Room_id: row.Room_id,
          Room_name: row.Room_name,
          Room_status: row.Room_status,
          slots: [],
        });
      }

      roomsMap.get(row.Room_id).slots.push({
        Slot_id: row.Slot_id,
        Slot_label: row.Slot_label,
        Slot_status: row.Slot_status,
      });
    }

    res.json(Array.from(roomsMap.values()));
  } catch (error) {
    console.error("Error fetching rooms with status:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/bookings", async (req, res) => {
  const { room_id, slot_id, user_id, booking_date } = req.body;

  if (!room_id || !slot_id || !user_id || !booking_date) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // ตรวจสอบว่าผู้ใช้จอง slot นี้ในวันนี้ไปแล้วหรือไม่
    const [existingUserBooking] = await connection.query(
      `SELECT * FROM bookings 
       WHERE User_id = ? AND Slot_id = ? AND booking_date = ?`,
      [user_id, slot_id, booking_date]
    );

    if (existingUserBooking.length > 0) {
      await connection.rollback();
      return res.status(409).json({ 
        message: "You have already booked this time slot on the selected date" 
      });
    }

    // ตรวจสอบสถานะห้อง
    const [existingSlot] = await connection.query(
      `SELECT * FROM room_slot_status 
       WHERE Room_id = ? AND Slot_id = ? AND Date = ? FOR UPDATE`,
      [room_id, slot_id, booking_date]
    );

    if (
      existingSlot.length > 0 &&
      existingSlot[0].Status &&
      existingSlot[0].Status.toLowerCase() !== "free"
    ) {
      await connection.rollback();
      return res
        .status(409)
        .json({ message: `Slot is already ${existingSlot[0].Status}` });
    }

    // อัพเดทสถานะห้อง
    if (existingSlot.length === 0) {
      await connection.query(
        `INSERT INTO room_slot_status (Room_id, Slot_id, Date, Status) 
         VALUES (?, ?, ?, 'Pending')`,
        [room_id, slot_id, booking_date]
      );
    } else {
      await connection.query(
        `UPDATE room_slot_status SET Status = 'Pending' 
         WHERE Room_id = ? AND Slot_id = ? AND Date = ?`,
        [room_id, slot_id, booking_date]
      );
    }

    // สร้างการจอง
    await connection.query(
      `INSERT INTO bookings (Room_id, Slot_id, User_id, booking_date, status) 
       VALUES (?, ?, ?, ?, 'pending')`,
      [room_id, slot_id, user_id, booking_date]
    );

    await connection.commit();
    res.status(201).json({ message: "Booking request successful" });
  } catch (error) {
    await connection.rollback();
    console.error("Error during booking:", error);
    
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ 
        message: "Duplicate booking detected" 
      });
    }
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    connection.release();
  }
});

app.get("/check", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ message: "Missing user_id" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT 
          b.Booking_id,
          b.booking_date,
          b.status,
          r.Room_name,
          ts.Label AS Slot_label
       FROM bookings b
       JOIN room r ON b.Room_id = r.Room_id
       JOIN time_slots ts ON b.Slot_id = ts.Slot_id
       WHERE b.User_id = ?
       ORDER BY b.booking_date DESC, ts.Slot_id ASC`,
      [user_id]
    );

    res.json(rows);
  } catch (error) {
    console.error("Error fetching user bookings:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
// ✅ API endpoint สำหรับดึง history
// ✅ เพิ่ม API endpoint สำหรับดึง history
app.get("/history", async (req, res) => {
  const { user_id } = req.query;

  console.log("📥 Received history request for user_id:", user_id);

  if (!user_id) {
    return res.status(400).json({ message: "Missing user_id" });
  }

  try {
    // ✅ ใช้ field 'action' จากตาราง history
    const [rows] = await pool.query(
      `SELECT 
        h.Log_id,
        h.booking_id,
        h.user_id,
        h.action,  -- ✅ ใช้ field นี้สำหรับสถานะ
        h.action_time,
        b.Room_id,
        b.Slot_id,
        b.booking_date,
        COALESCE(r.Room_name, 'Unknown Room') AS Room_name,
        COALESCE(ts.Label, 'N/A') AS Slot_label
       FROM history h
       LEFT JOIN bookings b ON h.booking_id = b.Booking_id
       LEFT JOIN room r ON b.Room_id = r.Room_id
       LEFT JOIN time_slots ts ON b.Slot_id = ts.Slot_id
       WHERE h.user_id = ?
       ORDER BY h.action_time DESC`,
      [user_id]
    );

    console.log("📊 History data found:", rows.length, "items");
    
    // ✅ Debug: แสดงข้อมูลที่ได้
    rows.forEach((row, index) => {
      console.log(`📦 History item ${index + 1}:`, {
        action: row.action,
        room_name: row.Room_name,
        booking_date: row.booking_date,
        slot_label: row.Slot_label
      });
    });

    res.status(200).json(rows);
  } catch (error) {
    console.error("🚨 Database error in history endpoint:", error);
    res.status(500).json({ 
      message: "Internal Server Error",
      error: error.message 
    });
  }
});


app.get("/get_user", async (req, res) => {
  const { user_id } = req.query;

  console.log(" Received request for user_id:", user_id);

  if (!user_id) {
    console.log("❌ Missing user_id");
    return res.status(400).json({ message: "Missing user_id" });
  }

  try {
    // แปลง user_id เป็น number (เผื่อส่งมาเป็น string)
    const userId = parseInt(user_id);
    
    console.log(" Searching for user with ID:", userId);
    
    const [rows] = await pool.query(
      "SELECT User_id, username, role FROM users WHERE User_id = ?",
      [userId]
    );

    console.log("Database result:", rows);

    if (rows.length === 0) {
      console.log(" User not found in database");
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];
    console.log(" User found:", user);
    res.status(200).json(user);
  } catch (error) {
    console.error(" Database error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Express server running at http://localhost:${port}`);
});