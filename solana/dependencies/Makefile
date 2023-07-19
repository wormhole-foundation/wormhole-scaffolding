.PHONY: all clean

#we don't use the nft_bridge program so we don't include it here
WORMHOLE_BRIDGES := bridge token_bridge
wormhole_sos := $(addsuffix .so, $(WORMHOLE_BRIDGES))
network_sos := $(addprefix $(NETWORK)/,$(wormhole_sos))

all: $(network_sos) mpl_token_metadata.so

clean:
	$(foreach network,$(supported_networks),rm -rf $(network);)
	rm -f mpl_token_metadata.so

#building Wormhole bridges with Solana version 1.15 or newer causes very strange behavior with
# the BPFLoaderUpgradeab1e program and how Wormhole bridges are loaded into the Solana validator
# hence this version check.
#This check should be removed once this issue has been resolved.
solana_version := $(shell solana --version 2>/dev/null | \
                    sed -n 's/^solana-cli \([0-9\.]*\) .*$$/\1/p')
max_solana_version := 1.15.0
ifndef solana_version
  $(error "Solana not installed - please install version 1.14.14 \(< $(max_solana_version)!\)")
endif
ifeq ($(shell printf '%s\n' "$(solana_version)" "$(max_solana_version)" | sort -V | head -n1), \
      $(max_solana_version))
  $(error "Solana version too new - please downgrade to 1.14.14")
endif

#defining these explicitly to deal with make peculiarities
space := $(subst ,, )
lparen := (
rparen := )
$(network_sos)&: #&: specifies a grouped target
	@echo "> Fetching Solana bridge programs from Wormhole repo"
	@if [ -d "tmp-wormhole" ]; then  \
		rm -rf "tmp-wormhole"; \
	fi
	git clone \
	  --depth 1 \
	  --branch main \
	  --filter=blob:none \
	  https://github.com/wormhole-foundation/wormhole \
	  tmp-wormhole > /dev/null 2>&1
	cd tmp-wormhole; git sparse-checkout set solana > /dev/null 2>&1
	@echo "> Building Wormhole Solana bridges"
	cd tmp-wormhole/solana; ${MAKE} artifacts NETWORK=$(NETWORK)
	mkdir -p $(NETWORK)
	mv $(addprefix tmp-wormhole/solana/artifacts-$(NETWORK)/,$(wormhole_sos)) $(NETWORK)
	cat tmp-wormhole/solana/Makefile | \
	  grep '^\(\($(subst $(space),\$(rparen)\|\$(lparen),$(WORMHOLE_BRIDGES))\)\)' | \
	  sed -n 's/^\(.*\)_ADDRESS_$(NETWORK)=\(.*\)$$/\1 = \2/p' \
	  > $(NETWORK)/wormhole_program_ids.toml
	rm -rf tmp-wormhole

mpl_token_metadata.so:
	@echo "> Fetching Metaplex token metadata program from Metaplex repo"
	rm -rf tmp-metaplex
	git clone https://github.com/metaplex-foundation/metaplex-program-library.git \
    tmp-metaplex > /dev/null 2>&1

	@echo "> Building Metaplex token metadata program"
#metaplex build script expects to be run from the root of its repo
	cd tmp-metaplex; ./build.sh token-metadata

	mv tmp-metaplex/test-programs/mpl_token_metadata.so .
	rm -rf tmp-metaplex
