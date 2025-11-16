const express = require("express");
const cors = require("cors");
const pool = require("./db");
const bcrypt = require("bcrypt");

const app = express();
const port = 3000;
app.use(cors());
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

// ===================================
// ✅ แก้ไข: API ดึงสถานะห้องและสล็อต
// ===================================
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
        r.image_url,
        r.status AS Room_status, 
        ts.Slot_id,
        ts.Label AS Slot_label,
        CASE 
            WHEN b.Room_id IS NOT NULL THEN b.status 
            ELSE 'Free' 
        END AS Slot_status
      FROM room r
      CROSS JOIN time_slots ts
      LEFT JOIN bookings b 
        ON r.Room_id = b.Room_id 
        AND ts.Slot_id = b.Slot_id 
        AND b.booking_date = ?  -- ✅ ใช้ date ที่ส่งมาจาก query
        AND b.status IN ('pending', 'approved')  -- ✅ เช็คเฉพาะการจองที่ยังคงใช้งาน
      
      ORDER BY r.Room_id, ts.Slot_id;
    `;

    // ✅ ส่ง [date] เข้าไปใน query เพื่อแทนที่ ?
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
          image_url: row.image_url,
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

// ===================================
// ✅ แก้ไข: API สร้างการจอง
// ===================================
app.post("/bookings", async (req, res) => {
  const { room_id, slot_id, user_id, booking_date } = req.body;

  if (!room_id || !slot_id || !user_id || !booking_date) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // ✅ ตรวจสอบว่าผู้ใช้มีการจองในวันที่เดียวกันแล้วหรือไม่ (จำกัด 1 ช่วง / วัน)
    const [existingActiveBooking] = await connection.query(
      `SELECT * FROM bookings 
       WHERE User_id = ? AND booking_date = ? AND status IN ('pending', 'approved')`,
      [user_id, booking_date]
    );

    console.log(
      `🔍 [CHECK USER LOCK] user_id=${user_id}, date=${booking_date} => Found ${existingActiveBooking.length} active booking(s)`
    );

    if (existingActiveBooking.length > 0) {
      console.log(
        `❌ [LOCK] User ${user_id} already has booking on ${booking_date}: `,
        existingActiveBooking[0]
      );
      await connection.rollback();
      return res.status(409).json({
        message:
          "You can only have 1 booking per day. Please cancel your existing booking for this date first.",
        existing_booking: existingActiveBooking[0],
      });
    }

    // ✅ แก้ไข: ตรวจสอบสถานะห้องจากตาราง 'bookings' (แทน room_slot_status)
    // ตรวจสอบว่ามี "ใครก็ได้" จอง Room_id, Slot_id, และ booking_date นี้ไปแล้วหรือยัง
    const [existingSlot] = await connection.query(
      `SELECT * FROM bookings 
       WHERE Room_id = ? AND Slot_id = ? AND booking_date = ? AND status IN ('pending', 'approved')
       FOR UPDATE`, // ใช้ FOR UPDATE เพื่อ lock แถว ป้องกันการจองซ้ำซ้อน
      [room_id, slot_id, booking_date]
    );

    console.log(
      `🔍 [CHECK SLOT] room=${room_id}, slot=${slot_id}, date=${booking_date} => Found ${existingSlot.length} active booking(s)`
    );

    // ✅ แก้ไข: ตรวจสอบว่ามีแถวข้อมูลหรือไม่ (ถ้ามี > 0 แสดงว่า slot ไม่ว่าง)
    if (existingSlot.length > 0) {
      console.log(
        `❌ [SLOT TAKEN] Room ${room_id} Slot ${slot_id} on ${booking_date} is already booked by user ${existingSlot[0].User_id}`
      );
      await connection.rollback();
      return res.status(409).json({ message: `Slot is already Booked` });
    }

    console.log(
      `✅ [SLOT FREE] Room ${room_id} Slot ${slot_id} on ${booking_date} is available for user ${user_id}`
    );

    // สร้างการจอง (อันนี้ถูกต้องแล้ว)
    const [insertResult] = await connection.query(
      `INSERT INTO bookings (Room_id, Slot_id, User_id, booking_date, status) 
       VALUES (?, ?, ?, ?, 'pending')`, // สร้างเป็น 'pending' ก่อน
      [room_id, slot_id, user_id, booking_date]
    );

    console.log(
      `📝 [BOOKING CREATED] user=${user_id}, booking_id=${insertResult.insertId}, status='pending'`
    );

    const bookingId = insertResult.insertId || insertResult.insert_id || null;

    await connection.commit();
    console.log(`✅ [TRANSACTION COMMITTED] booking_id=${bookingId}`);
    res
      .status(201)
      .json({ message: "Booking request successful", booking_id: bookingId });
  } catch (error) {
    await connection.rollback();
    console.error("Error during booking:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Duplicate booking detected",
      });
    }
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    connection.release();
  }
});

// ✅ (ตัวอย่าง) API ดึงการจองที่ 'pending' ทั้งหมด
app.get("/bookings/pending", async (req, res) => {
  try {
    // 🔽🔽🔽 ใช้ SQL Query ใหม่นี้ 🔽🔽🔽
    const sql = `
      SELECT 
         b.Booking_id, 
         b.booking_date AS date,       -- 1. เปลี่ยนชื่อ AS date
         r.Room_name AS roomName,      -- 2. เปลี่ยนชื่อ AS roomName
         r.image_url AS image,       -- 3. เพิ่ม image (ต้องมีในตาราง room)
         r.price_per_day AS price,           -- 4. เพิ่ม price (ต้องมีในตาราง room)
         ts.Label AS time,           -- 5. เปลี่ยนชื่อ AS time
         u.username AS username        -- 6. เปลี่ยนชื่อ AS username
       FROM bookings b
       JOIN room r ON b.Room_id = r.Room_id
       JOIN time_slots ts ON b.Slot_id = ts.Slot_id
       JOIN users u ON b.User_id = u.User_id
       WHERE b.status = 'pending'
       ORDER BY b.booking_date, ts.Slot_id`;
    // 🔼🔼🔼 ------------------- 🔼🔼🔼

    const [rows] = await pool.query(sql);
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching pending bookings:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ✅ (ตัวอย่าง) API สำหรับ อนุมัติ (approve) หรือ ปฏิเสธ (reject)
app.patch("/bookings/:booking_id/status", async (req, res) => {
  const { booking_id } = req.params;
  const { new_status } = req.body; // รับ 'approved' หรือ 'rejected'

  if (
    !booking_id ||
    !new_status ||
    !["approved", "rejected"].includes(new_status)
  ) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // อัปเดตสถานะ
    const [result] = await connection.query(
      "UPDATE bookings SET status = ? WHERE Booking_id = ? AND status = 'pending'",
      [new_status, booking_id]
    );

    if (result.affectedRows === 0) {
      // อาจจะถูกอนุมัติ/ปฏิเสธไปแล้ว
      await connection.rollback();
      return res
        .status(404)
        .json({ message: "Booking not found or already processed" });
    }

    // บันทึกประวัติ (สำคัญมาก!)
    // (ดึง user_id จากการจองก่อน)
    const [booking] = await connection.query(
      "SELECT User_id FROM bookings WHERE Booking_id = ?",
      [booking_id]
    );
    const userId = booking[0]?.User_id || null;

    await connection.query(
      "INSERT INTO history (booking_id, user_id, action, action_time) VALUES (?, ?, ?, NOW())",
      [booking_id, userId, new_status] // บันทึก 'approved' หรือ 'rejected'
    );

    await connection.commit();
    res.status(200).json({ message: `Booking ${new_status} successfully` });
  } catch (error) {
    await connection.rollback();
    console.error(`Error updating status for booking ${booking_id}:`, error);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    connection.release();
  }
});

// =========================
// ✅ API ยกเลิกการจอง (Cancel Booking)
// =========================
app.delete("/bookings/:booking_id", async (req, res) => {
  const { booking_id } = req.params;

  if (!booking_id) {
    return res.status(400).json({ message: "Missing booking_id" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // ตรวจสอบว่าการจองมีอยู่จริงหรือไม่
    const [booking] = await connection.query(
      `SELECT * FROM bookings WHERE Booking_id = ?`,
      [booking_id]
    );

    if (booking.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Booking not found" });
    }

    // ยกเลิกการจอง (เปลี่ยน status เป็น cancelled)
    await connection.query(
      `UPDATE bookings SET status = 'cancelled' WHERE Booking_id = ?`,
      [booking_id]
    );

    // บันทึกประวัติการยกเลิก
    try {
      const historyUserId = booking[0].User_id ?? booking[0].user_id ?? null;
      await connection.query(
        `INSERT INTO history (booking_id, user_id, action, action_time) VALUES (?, ?, ?, NOW())`,
        [booking_id, historyUserId, "cancelled"]
      );
    } catch (e) {
      // หากการบันทึกประวัติล้มเหลว ให้วนต่อไป (ไม่ขัดขวางการยกเลิก)
      console.error("Failed to insert history for cancellation:", e);
    }

    await connection.commit();
    res.status(200).json({ message: "Booking cancelled successfully" });
  } catch (error) {
    await connection.rollback();
    console.error("Error cancelling booking:", error);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    connection.release();
  }
});

// =========================
// ✅ API ตรวจสอบการจอง (Check)
// =========================
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
         r.price_per_day,
         ts.Label AS Slot_label,
         u.username
       FROM bookings b
       JOIN room r ON b.Room_id = r.Room_id
       JOIN time_slots ts ON b.Slot_id = ts.Slot_id
       JOIN users u ON b.User_id = u.User_id
  WHERE b.User_id = ? AND b.status IN ('pending', 'approved')
       ORDER BY b.booking_date DESC, ts.Slot_id ASC`,
      [user_id]
    );

    res.json(rows);
  } catch (error) {
    console.error("Error fetching user bookings:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ===================================
// ✅ API สำหรับหน้า Dashboard
// ===================================
app.get("/api/dashboard/summary", async (req, res) => {
  console.log("📊 Request received for /api/dashboard/summary");

  try {
    // 1. สร้าง Query 4 ตัว

    // 1.1. นับ "Total Slots" (จำนวนห้องทั้งหมด * จำนวนสล็อตทั้งหมด)
    const totalSlotsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM room) AS roomCount,
        (SELECT COUNT(*) FROM time_slots) AS slotCount
    `;

    // 1.2. นับ "Free Slots" (ของวันนี้)
    // (เราจะนับสล็อตที่ "ถูกจอง" แล้วเอาไปลบทีหลัง)
    const bookedSlotsTodayQuery = `
      SELECT COUNT(*) AS bookedCount 
      FROM bookings 
      WHERE booking_date = CURDATE() 
        AND status IN ('pending', 'approved')
    `;

    // 1.3. นับ "Pending Slots" (ทั้งหมด)
    const pendingSlotsQuery = `
      SELECT COUNT(*) AS pendingCount 
      FROM bookings 
      WHERE status = 'pending'
    `;

    // 1.4. นับ "Disable Rooms"
    const disabledRoomsQuery = `
      SELECT COUNT(*) AS disabledCount 
      FROM room 
      WHERE status = 'disabled'
    `;

    // 2. 🌟 (แก้ไข) รันทุก Query และรับผลลัพธ์แบบง่ายๆ
    const [
      totalSlotsData,
      bookedSlotsTodayData,
      pendingSlotsData,
      disabledRoomsData,
    ] = await Promise.all([
      pool.query(totalSlotsQuery),
      pool.query(bookedSlotsTodayQuery),
      pool.query(pendingSlotsQuery),
      pool.query(disabledRoomsQuery),
    ]);

    // 3. 🌟 (แก้ไข) ดึง "แถวแรก" (row [0]) จาก "ข้อมูล" (data [0]) ของแต่ละผลลัพธ์
    // (เพราะ pool.query จะ trả về [rows, fields])
    const totalSlotsResult = totalSlotsData[0][0];
    const bookedSlotsTodayResult = bookedSlotsTodayData[0][0];
    const pendingSlotsResult = pendingSlotsData[0][0];
    const disabledRoomsResult = disabledRoomsData[0][0];

    // 4. (เพิ่ม) Log ไว้เช็กค่าที่ได้จาก DB (สำคัญมาก)
    console.log("🔍 Debug Query Results:", {
      totalSlotsResult,
      bookedSlotsTodayResult,
      pendingSlotsResult,
      disabledRoomsResult,
    });

    // 5. 🌟 (แก้ไข) คำนวณผลลัพธ์ (เพิ่ม || 0 เพื่อกันค่า null)
    const totalSlots =
      (totalSlotsResult.roomCount || 0) * (totalSlotsResult.slotCount || 0);
    const freeSlots = totalSlots - (bookedSlotsTodayResult.bookedCount || 0);
    const pendingSlots = pendingSlotsResult.pendingCount || 0;
    const disabledRooms = disabledRoomsResult.disabledCount || 0;

    // (เพิ่ม) Log ไว้เช็กค่าที่คำนวณได้
    console.log("🔢 Calculated Summary:", {
      totalSlots,
      freeSlots,
      pendingSlots,
      disabledRooms,
    });

    // 6. ส่ง JSON กลับไปให้ Flutter
    res.status(200).json({
      totalSlots: totalSlots,
      freeSlots: freeSlots,
      pendingSlots: pendingSlots,
      disabledRooms: disabledRooms,
    });
  } catch (error) {
    console.error("❌ Error fetching dashboard summary:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// ✅ API ดึงประวัติ (History)
// =========================
app.get("/history", async (req, res) => {
  // Accept user_id from query or body to be tolerant for different frontends
  const user_id_raw = req.query.user_id ?? req.body?.user_id;
  console.log(
    "📥 Received history request (query/body) for user_id:",
    user_id_raw
  );

  const userId = user_id_raw ? parseInt(user_id_raw, 10) : null;

  // If frontend didn't send user_id, return empty array (so UI can show empty history)
  if (!userId) {
    console.log("⚠️  No user_id provided to /history - returning empty array");
    return res.status(200).json([]);
  }

  try {
    // Use COALESCE to handle different possible column names in the history table (user_id or User_id)
    const [rows] = await pool.query(
      `SELECT 
         h.Log_id,
         h.booking_id,
         COALESCE(h.user_id, h.User_id) AS history_user_id,
         h.action,
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
      WHERE COALESCE(h.user_id, h.User_id) = ?
      -- Order by booking_date (newest first). If booking_date is NULL, fall back to action_time.
      ORDER BY b.booking_date DESC, h.action_time DESC`,
      [userId]
    );

    console.log(
      "📊 History data found for userId:",
      userId,
      "=>",
      rows.length,
      "items"
    );

    rows.forEach((row, index) => {
      console.log(`📦 History item ${index + 1}:`, {
        action: row.action,
        room_name: row.Room_name,
        booking_date: row.booking_date,
        slot_label: row.Slot_label,
      });
    });

    return res.status(200).json(rows);
  } catch (error) {
    console.error("🚨 Database error in history endpoint:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

// Small debug endpoint to quickly inspect recent history rows (useful during dev)
app.get("/history/debug", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM history ORDER BY action_time DESC LIMIT 50`
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching history debug:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
app.post("/staff/add_room", async (req, res) => {
  const { Room_name, image_url, price_per_day, status } = req.body;
  try {
    if (!Room_name || !price_per_day) {
      return res.status(400).json({ message: "Room name and price are required" });
    }
    const [existingRoom] = await pool.query(
      "SELECT Room_name FROM room WHERE Room_name = ?",
      [Room_name]
    );
    if (existingRoom.length > 0) {
      return res.status(400).json({ message: "Room name already exists" });
    }
    const [result] = await pool.query(
      "INSERT INTO room (Room_name, image_url, price_per_day, status) VALUES (?, ?, ?, ?)",
      [Room_name, image_url, price_per_day, status || 'available']
    );
    res.status(201).json({ 
      message: "Room added successfully", 
      room_id: result.insertId 
    });
  } catch (error) {
    console.error("Error adding room:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/staff/edit_room", async (req, res) => {
  const { Room_id, Room_name, image_url, price_per_day, status } = req.body;
  
  try {
  
    if (!Room_id) {
      return res.status(400).json({ message: "Room ID is required" });
    }

    
    const [existingRoom] = await pool.query(
      "SELECT Room_id FROM room WHERE Room_id = ?",
      [Room_id]
    );

    if (existingRoom.length === 0) {
      return res.status(404).json({ message: "Room not found" });
    }

   
    if (Room_name) {
      const [duplicateRoom] = await pool.query(
        "SELECT Room_id FROM room WHERE Room_name = ? AND Room_id != ?",
        [Room_name, Room_id]
      );

      if (duplicateRoom.length > 0) {
        return res.status(400).json({ message: "Room name already exists" });
      }
    }

   
    let updateFields = [];
    let updateValues = [];

    if (Room_name) {
      updateFields.push("Room_name = ?");
      updateValues.push(Room_name);
    }
    if (image_url) {
      updateFields.push("image_url = ?");
      updateValues.push(image_url);
    }
    if (price_per_day) {
      updateFields.push("price_per_day = ?");
      updateValues.push(price_per_day);
    }
    if (status) {
      updateFields.push("status = ?");
      updateValues.push(status);
    }

   
    if (updateFields.length > 0) {
      updateValues.push(Room_id); 

      await pool.query(
        `UPDATE room SET ${updateFields.join(", ")} WHERE Room_id = ?`,
        updateValues
      );

      res.status(200).json({ 
        message: "Room updated successfully" 
      });
    } else {
      res.status(400).json({ 
        message: "No fields to update" 
      });
    }
    
  } catch (error) {
    console.error("Error updating room:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
app.get("/staff/history", async (req, res) => {
  try {
    // ดึงประวัติทั้งหมดจากตาราง history
    const [history] = await pool.query(`
      SELECT 
        h.Log_id,
        h.booking_id,
        h.user_id,
        h.action,
        h.action_time,
        u.username,
        u.role,
        b.Room_id,
        r.Room_name,
        b.booking_date,
        s.Start_time,
        s.End_time
      FROM history h
      LEFT JOIN users u ON h.user_id = u.User_id
      LEFT JOIN bookings b ON h.booking_id = b.Booking_id
      LEFT JOIN room r ON b.Room_id = r.Room_id
      LEFT JOIN time_slots s ON b.Slot_id = s.Slot_id
      ORDER BY h.action_time DESC
    `);

    res.status(200).json({
      message: "History retrieved successfully",
      data: history
    });

  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/staff/dashboard", async (req, res) => {
  try {
 
    const [totalBookings] = await pool.query(`
      SELECT COUNT(*) as total FROM bookings
    `);

   
    const [bookingStatus] = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM bookings 
      GROUP BY status
    `);

   
    const [userRoles] = await pool.query(`
      SELECT role, COUNT(*) as count 
      FROM users 
      GROUP BY role
    `);

   
    const [recentHistory] = await pool.query(`
      SELECT 
        h.action,
        h.action_time,
        u.username,
        u.role,
        r.Room_name
      FROM history h
      LEFT JOIN users u ON h.user_id = u.User_id
      LEFT JOIN bookings b ON h.booking_id = b.Booking_id
      LEFT JOIN room r ON b.Room_id = r.Room_id
      ORDER BY h.action_time DESC 
      LIMIT 10
    `);

    res.status(200).json({
      message: "Dashboard data retrieved successfully",
      data: {
        totalBookings: totalBookings[0].total,
        bookingStatus,
        userRoles,
        recentHistory
      }
    });

  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
// =========================
// ✅ API ดึงประวัติ (History) - (สำหรับ Lecturer/Admin)
// =========================
app.get("/history/all", async (req, res) => {
  console.log("📊 Request received for /history/all (Lecturer View)");

  try {
    // ❗️ Key: เราลบ "WHERE user_id = ?" ออกไป
    // และเราเพิ่ม u.username เข้ามา เพื่อให้รู้ว่าเป็นของใคร
    const [rows] = await pool.query(
      `SELECT 
h.Log_id,
h.booking_id,
h.action,
h.action_time,
b.booking_date,
COALESCE(r.Room_name, 'Unknown Room') AS Room_name,
COALESCE(ts.Label, 'N/A') AS Slot_label,
COALESCE(u.username, 'Unknown User') AS username 
FROM history h
LEFT JOIN bookings b ON h.booking_id = b.Booking_id
LEFT JOIN room r ON b.Room_id = r.Room_id
LEFT JOIN time_slots ts ON b.Slot_id = ts.Slot_id
LEFT JOIN users u ON COALESCE(h.user_id, h.User_id) = u.User_id 
ORDER BY h.action_time DESC`
    );

    console.log("📊 Found", rows.length, "total history items for admin");
    return res.status(200).json(rows);
  } catch (error) {
    console.error("🚨 Database error in /history/all endpoint:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

// =========================
// ✅ API ดึงข้อมูลผู้ใช้
// =========================
app.get("/get_user", async (req, res) => {
  const { user_id } = req.query;

  console.log(" Received request for user_id:", user_id);

  if (!user_id) {
    console.log("❌ Missing user_id");
    return res.status(400).json({ message: "Missing user_id" });
  }

  try {
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
// GET /staff/rooms
app.get("/staff/rooms", async (req, res) => {
  try {
    const [rooms] = await pool.query(`
      SELECT 
        Room_id,
        Room_name,
        image_url,
        price_per_day,
        status
      FROM room 
      ORDER BY Room_id DESC
    `);

    // ตรวจสอบว่ามีข้อมูลหรือไม่
    if (rooms.length === 0) {
      return res.status(404).json({ 
        message: "No rooms found",
        data: []
      });
    }

    res.status(200).json({
      message: "Rooms retrieved successfully",
      data: rooms
    });

  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ 
      message: "Internal Server Error",
      error: error.message 
    });
  }
});

// =========================
// ✅ Start Server
// =========================
app.listen(port, "0.0.0.0", () => {
  console.log(`Express server running at http://localhost:${port}`);
});
