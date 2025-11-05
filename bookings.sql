-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 06, 2025 at 12:14 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `project_moblie`
--

-- --------------------------------------------------------

--
-- Table structure for table `bookings`
--

CREATE TABLE `bookings` (
  `Booking_id` int(11) NOT NULL,
  `Room_id` int(11) NOT NULL,
  `Slot_id` int(11) NOT NULL,
  `User_id` int(11) NOT NULL,
  `booking_date` date NOT NULL,
  `status` enum('approved','pending','rejected') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `bookings`
--

INSERT INTO `bookings` (`Booking_id`, `Room_id`, `Slot_id`, `User_id`, `booking_date`, `status`) VALUES
(31, 1, 1, 5, '2025-11-06', 'approved');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `bookings`
--
ALTER TABLE `bookings`
  ADD PRIMARY KEY (`Booking_id`),
  ADD UNIQUE KEY `unique_user_slot_per_day` (`User_id`,`Slot_id`,`booking_date`),
  ADD KEY `Room_id` (`Room_id`),
  ADD KEY `Slot_id` (`Slot_id`),
  ADD KEY `idx_booking_check` (`User_id`,`Room_id`,`Slot_id`,`booking_date`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `bookings`
--
ALTER TABLE `bookings`
  MODIFY `Booking_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=32;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `bookings`
--
ALTER TABLE `bookings`
  ADD CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`Room_id`) REFERENCES `room` (`Room_id`),
  ADD CONSTRAINT `bookings_ibfk_2` FOREIGN KEY (`Slot_id`) REFERENCES `time_slots` (`Slot_id`),
  ADD CONSTRAINT `bookings_ibfk_3` FOREIGN KEY (`User_id`) REFERENCES `users` (`User_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
