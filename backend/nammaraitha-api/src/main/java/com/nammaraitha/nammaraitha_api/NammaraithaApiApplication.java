package com.nammaraitha.nammaraitha_api;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import com.nammaraitha.nammaraitha_api.service.UserService;

@SpringBootApplication
public class NammaraithaApiApplication implements CommandLineRunner {

    public static void main(String[] args) {
        SpringApplication.run(NammaraithaApiApplication.class, args);
    }

    @Autowired
    private UserService userService;

    @Override
    public void run(String... args) {
        userService.insertUsersWithDuplicateEmail();
    }
}
