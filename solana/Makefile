.DEFAULT_GOAL = build
.PHONY: build test unit-test integration-test clean

ifndef (NETWORK)
  $(info No NETWORK specified, defaulting to local cluster (devnet))
  NETWORK = devnet
endif
#exported for use in dependencies/Makefile and TypeScript code
export NETWORK := $(strip $(NETWORK))

#WARNING regarding naming conflicts between Solana clusters and Wormhole networks!
#testnet actually refers to Solana's devnet cluster (Solana also has a cluster called testnet but
# that is meant for trying out new version/releases of the protocol and not for smart contract devs)
#devnet refers to Wormhole's tilt devnet i.e. it's a local cluster
export supported_networks := mainnet testnet devnet

# ----------------------------------------- IMPLEMENTATION -----------------------------------------

ifeq ($(strip $(filter $(supported_networks),$(NETWORK))),)
  $(error Invalid choice $(NETWORK) for NETWORK - must be one of $(supported_networks))
endif

base58_char := [a-km-zA-HJ-NP-Z1-9]

#Ok, the following build code is a bit of a doosy, so bear with me.
#
#Our goal is to avoid having to go through Anchor's silly, Rube Goldberg-esque deploy process of
# "build, get the generated program ids, manually replace the old ids in the declare_id! macros of
# our programs as well as in Anchor.toml, then build for real so we can finally actually deploy".
# <insert long, exasperated rant about lack of DRY and non-streamlined build processes here>
#
#To accomplish this we:
# 1. determine the program ids (using `anchor list keys`)
# 2. then generate Anchor.toml dynamically (with the help of Anchor.toml.base)
# 3. and finally pass the program ids to Rust in a way that they can be used at compile time
#
#All three steps are annoyingly finicky - hence this long elaboration.
#
#Right off the bat we run into a catch-22 type situation because to run `anchor list keys`, which
# prints the program ids of our programs, we need Anchor.toml to exist (in particular, it needs the
# provider that's specified in there). We cut the Gordian knot by temporarily replacing any existing
# Anchor.toml with its .base version, then runing `anchor list keys`, and then undoing things again.
#
#(We can't just use copy without overwrite (cp -n) because if Anchor.toml was deleted manually it
# would fail to trigger a proper rebuild because now Anchor.toml is already newer than its
# dependencies.)
#
#For passing the program ids to Rust, it would be preferable to just set them in environment
# variables and pass those values to the declare_id! macro. However, the declare_id! macro expects
# either a string literal or a Pubkey struct, but reading environment variables at compile time via
# the env! macro yields &'static str and there is no good way to convert a base58 encoded str into a
# Pubkey at compile time (the only const constructor function that Pubkey offers takes a [u8; 32]
# byte array and in turn the decode function of the base58 crate that Solana uses is not const and
# so we can't actually convert our base58 str into said byte array at compile time).
#Thus we instead use the include_bytes! macro to read the program id as a byte array from a file
# that that we create with our generate_pid_bytes_file.ts TypeScript script.
#
#Overall this process is a lot more involved than I'd like and hence far from elegant, but at least
# we now only have to build once and be done and don't have to manually specify/update the program
# ids everywhere.

#initialize 'programs' as a variable that's expanded immediately, otherwise the subsequent += pname
# call won't be expanded in time and thus programs would erroneously end up empty
programs :=
define expand_program_definitions_block
$(eval name_id := $(subst :, ,$(1)))
$(eval pname := $(word 1, $(name_id)))
$(eval $(pname)_base58_pid := $(word 2, $(name_id)))
$(eval $(pname)_keypair_file := $(CURDIR)/target/deploy/$(pname)-keypair.json)
$(eval $(pname)_pid_bin_file := $(CURDIR)/target/deploy/$(pname)-program_id.bin)
$(eval programs += $(pname))
$(eval undefine name_id pname)
endef

#`anchor keys list` generates all keypair files in target/deploy as a side effect if they don't
# exist hence there's no rule for them yet!
keys_list_syntax = \([^:]*\): *\($(base58_char)*\)
anchor_keys_list := $(shell \
  mv -f Anchor.toml Anchor.toml.tmp 2>/dev/null; cp Anchor.toml.base Anchor.toml; \
  anchor keys list | sed 's/^$(keys_list_syntax)$$/\1:\2/'; \
  rm Anchor.toml; mv -f Anchor.toml.tmp Anchor.toml 2>/dev/null)
ifneq ($(shell echo $(anchor_keys_list) | sed -n 's/$(keys_list_syntax)/\1:\2/p'),\
       $(anchor_keys_list))
  $(error Unexpected output from `anchor keys list` (Do you have a typo in Anchor.toml.base?):\
          $(anchor_keys_list))
endif
$(foreach prognkey,$(anchor_keys_list),$(call expand_program_definitions_block,$(prognkey)))
undefine anchor_keys_list keys_list_syntax

define to_upper
$(strip $(shell echo '$(1)' | tr '[:lower:]' '[:upper:]'))
endef

#we'd love to use these environment variables directly in our Rust code too (not just in TS)...
$(foreach pname,$(programs),\
  $(eval export $(call to_upper,$(pname))_PROGRAM_ID=$($(pname)_base58_pid)))
#... alas we have to go through the binary files instead
$(foreach pname,$(programs),\
  $(eval export $(call to_upper,$(pname))_PROGRAM_ID_FILE=$($(pname)_pid_bin_file)))

.PHONY: build-prerequs dependencies

test: unit-test integration-test

unit-test: build-prerequs
	cargo clippy --features $(NETWORK) -- --allow clippy::result_large_err
	cargo test --features $(NETWORK)

integration-test: build-prerequs
	anchor test --arch sbf -- --features $(NETWORK)

build: build-prerequs
	@echo "> Building programs"
	anchor build --arch sbf -- --features $(NETWORK)

build-prerequs: dependencies Anchor.toml node_modules \
    $(foreach pname,$(programs),$($(pname)_pid_bin_file))
	
dependencies:
	@echo "> Building dependencies for $(NETWORK)"
	@$(MAKE) -C dependencies

clean:
	@$(MAKE) -C dependencies clean
	rm -rf node_modules target .anchor Anchor.toml

#phony targets above, non-phony targets below

find_pattern = ^\([a-zA-Z0-9_]*\)\s*=\s*\($(base58_char)*\)$$
replace_pattern = \n[[test.genesis]]\naddress = "\2"\nprogram = ".\/dependencies\/$(NETWORK)\/\1.so"
Anchor.toml: Anchor.toml.base dependencies/$(NETWORK)/wormhole_program_ids.toml \
    $(foreach pname,$(programs),$($(pname)_keypair_file)) target/network_changed
	@echo "> Generating Anchor.toml"
	printf %b "######################################################################\n" \
	          "# This file is autogenerated by make - edit Anchor.toml.base instead #\n" \
	          "######################################################################\n" \
	  > Anchor.toml
	cat Anchor.toml.base >> Anchor.toml
	cat dependencies/$(NETWORK)/wormhole_program_ids.toml | \
	    sed -n 's/$(find_pattern)/$(replace_pattern)/p' \
	  >> Anchor.toml
	printf %b "\n[programs.localnet]\n" \
	    $(foreach pname,$(programs),"$(pname) = \"$($(pname)_base58_pid)\"\n") \
	  >> Anchor.toml

dependencies/$(NETWORK)/wormhole_program_ids.toml: dependencies

ifneq ($(NETWORK), $(shell cat target/network_changed 2>/dev/null))
#force update of target/network_changed if value of NETWORK changed from last time
.PHONY: target/network_changed
endif
target/network_changed:
	echo $(NETWORK) > target/network_changed

define pid_bin_file_rule
$($(1)_pid_bin_file): $($(1)_keypair_file) node_modules
	yarn run ts-node ts/generate_pid_bytes_file.ts $($(1)_base58_pid) $($(1)_pid_bin_file)
endef
$(foreach pname,$(programs),$(eval $(call pid_bin_file_rule,$(pname))))
	
node_modules: package.json yarn.lock
	@echo "> Updating node modules"
	yarn
	touch node_modules
