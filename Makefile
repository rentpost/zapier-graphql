#!/usr/bin/make -f

SHELL:=/bin/bash

.PHONY: help init install-vendors update-vendors test


# Test that we have the necessary binaries available
define checkExecutables
    $(foreach exec,$(1),\
		$(if $(shell command -v $(exec)),,$(error Unable to find `$(exec)` in your PATH)))
endef

test := $(call checkExecutables, pnpm jest)


# Note that all comments with two hashes(#) will be used for output with `make help`. Alignment is tricky!
help:
	@fgrep -h "##" $(MAKEFILE_LIST) | fgrep -v fgrep | sed -e 's/\\$$//' | sed -e 's/##//'


##
## This is a list of available make commands that can be run.
##

init:						   ## Initialize the project
	@make install-vendors


install-vendors:               ## Install all dependencies using the lock file
	@pnpm i


update-vendors:                ## Updates/upgrades all dependencies
	@pnpm update


test:                          ## Runs all of the tests
	@jest
