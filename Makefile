#!/usr/bin/make -f

SHELL := /bin/bash


# Test that we have the necessary binaries available
define checkExecutables
    $(foreach exec,$(1),\
		$(if $(shell command -v $(exec)),,$(error Unable to find `$(exec)` in your PATH)))
endef

test := $(call checkExecutables, pnpm jest)


# Note that all comments with two hashes(#) will be used for output with `make help`. Alignment is tricky!
.PHONY: help
help:
	@fgrep -h "##" $(MAKEFILE_LIST) | fgrep -v fgrep | sed -e 's/\\$$//' | sed -e 's/##//'

##
## Zapier GraphQL — RentPost Zapier integration make targets. Run `make help` to list targets.
##

##
## --- Setup ---------------------------------------------------------------
##

.PHONY: init
init:                  ## Initialize the project
	@make install-vendors


##
## --- Dependencies --------------------------------------------------------
##

.PHONY: install-vendors
install-vendors:       ## Install all dependencies using the lock file
	@pnpm i


.PHONY: update-vendors
update-vendors:        ## Updates/upgrades all dependencies
	@pnpm update


##
## --- Testing -------------------------------------------------------------
##

.PHONY: test
test:                  ## Runs all of the tests
	@jest
