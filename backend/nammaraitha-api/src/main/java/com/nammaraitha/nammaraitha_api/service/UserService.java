package com.nammaraitha.nammaraitha_api.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import com.nammaraitha.nammaraitha_api.model.User;
import com.nammaraitha.nammaraitha_api.repository.UserRepository;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    public void insertUsersWithDuplicateEmail() {
        User user1 = new User("Ravi", "ravi@example.com", "pass123", "Farmer");
        User user2 = new User("Another Ravi", "ravi@example.com", "pass456", "Retailer"); // same email

        try {
            userRepository.save(user1);
            System.out.println("✅ User1 saved");
        } catch (Exception e) {
            System.out.println("❌ Failed to save User1: " + e.getMessage());
        }

        try {
            userRepository.save(user2); // this should fail
            System.out.println("✅ User2 saved");
        } catch (DataIntegrityViolationException e) {
            System.out.println("❌ Duplicate email error for User2: " + e.getRootCause().getMessage());
        }
    }
}
