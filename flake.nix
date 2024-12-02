{
  description = "A flake for a shell with Python and specific packages";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs";
  };

  outputs = { self, nixpkgs }: {
    devShells.default = nixpkgs.lib.mkShell {
      buildInputs = [
      ];
    };
  };
}
