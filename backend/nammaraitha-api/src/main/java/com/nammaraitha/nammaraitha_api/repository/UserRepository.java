package com.nammaraitha.nammaraitha_api.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.nammaraitha.nammaraitha_api.model.User;

public interface UserRepository extends JpaRepository<User, Long> {
    boolean existsByEmail(String email);
}
