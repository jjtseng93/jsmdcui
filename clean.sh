#!/bin/sh

sd=$(dirname "$0")

rm "$sd"/*.md.* "$sd"/*.md-*
rm "$sd"/demos/*.md.* "$sd"/demos/*.md-*
