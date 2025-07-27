package com.nammaraitha.nammaraitha_api.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.nammaraitha.nammaraitha_api.model.User;
import com.nammaraitha.nammaraitha_api.repository.UserRepository;

@RestController
@RequestMapping("/api/users")
@CrossOrigin(origins = "*")
public class UserController {

    @Autowired
    private UserRepository userRepository;

    @PostMapping("/signup")
    public ResponseEntity<?> signup(@RequestBody User user) {
        if (userRepository.existsByEmail(user.getEmail())) {
            return ResponseEntity
                    .badRequest()
                    .body("{\"success\": false, \"message\": \"Email already exists\"}");
        }

        userRepository.save(user);
        return ResponseEntity.ok("{\"success\": true, \"message\": \"Signup successful\"}");
    }
}
