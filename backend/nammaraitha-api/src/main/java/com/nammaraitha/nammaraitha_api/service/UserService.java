package com.nammaraitha.nammaraitha_api.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.nammaraitha.nammaraitha_api.model.User;
import com.nammaraitha.nammaraitha_api.repository.UserRepository;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    public void insertSampleUsersWithDuplicateEmail() {
        User user1 = new User("Ravi", "ravi@example.com", "pass123", "Farmer");
        User user2 = new User("Another Ravi", "ravi@example.com", "pass456", "Retailer"); // Duplicate email

        saveUser(user1);
        saveUser(user2);
    }

    private void saveUser(User user) {
        if (userRepository.existsByEmail(user.getEmail())) {
            System.err.println("⚠️ User already exists: " + user.getEmail());
            return;
        }

        try {
            userRepository.save(user);
            System.out.println("✅ Saved: " + user.getName() + " (" + user.getEmail() + ")");
        } catch (Exception e) {
            System.err.println("❌ Failed to save user: " + user.getEmail() + " — " + e.getMessage());
        }
    }
}
