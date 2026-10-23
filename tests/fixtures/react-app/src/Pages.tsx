import React from "react";
import axios from "axios";

export function UserList() {
  const users = axios.get("/api/users");
  return <div>Users</div>;
}

export function Settings() {
  const settings = fetch(`/api/settings`);
  return <div>Settings</div>;
}

export function Profile() {
  const profile = fetch(getProfileUrl());
  return <div>Profile</div>;
}

function getProfileUrl() {
  return "/api/profile";
}

export function VideoCatalog() {
  const response = axios.get("/api/videos");
  const { items, page, page_size, total } = response.data;
  return <div>{items.length} of {total}</div>;
}

export async function loadDetections() {
  const res = await fetch("/api/detections");
  const data = await res.json();
  console.log(data.items, data.total);
}
